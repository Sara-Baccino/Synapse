"""
synapse_gui.routers.matching
--------------------------------------

Bridge between the GUI and synapse_matching: run/status/result/download/
report endpoints, modeled directly on synclair-gui's structure.py. This
is the first time synapse_matching is exposed via HTTP -- once
validated here, the same pattern will be ported to synclair-gui.

Reuses BasePipeline for preprocessing orchestration (Loader -> config
handled by BasePipeline itself given a raw dataset path); the in-memory
dataframe already in dataset_store is written to a temporary file first,
same as structure.py does.
"""

from __future__ import annotations

import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field, ValidationError

from synapse_core.models.analysis_result import AnalysisResult
from synapse_core.models.data_config import DataConfig
from synapse_core.pipeline.base_pipeline import BasePipeline
from synapse_reporting.report_manager import ReportManager
from synapse_core.dataset.preprocessing import Preprocessing

from synapse_gui.routers.auth import CurrentUserResponse, get_current_user
from synapse_gui.routers.datasets import _data_config_to_dto
from synapse_gui.services.dataset_store import DatasetNotFoundError, dataset_store
from synapse_gui.services.job_manager import (
    JobNotFoundError, JobProgressReporter, JobStatus, job_manager,
)

from synapse_matching.config.matching_module_config import MatchingModuleConfig
from synapse_matching.pipeline.matching_module import MatchingModule
from synapse_matching.exploration.population_profile import PopulationProfiler

__all__ = ["router"]

router = APIRouter(prefix="/matching", tags=["matching"])

_PREVIEW_ROW_LIMIT = 20

RUNS_DIR = Path(tempfile.gettempdir()) / "synapse_runs"
"""Where each job's full AnalysisResult is persisted (save_analysis_result:
tables/datasets as parquet, artifacts as joblib, summary+manifest as JSON),
one subfolder per job_id. Process-local temp dir for now -- the minimal
persistence solution requested: no database, but runs survive past the
in-memory JobManager/AnalysisResult object being garbage-collected, and
GET /matching/jobs/{id}/result can be served straight from JobManager while
the process is alive, or reconstructed via load_analysis_result from here
if it isn't."""


# ---------------------------------------------------------------------- #
# DTOs
# ---------------------------------------------------------------------- #
class MatchingRunRequest(BaseModel):
    dataset_id: str
    """The single dataset to run matching on -- for the two-dataset
    workflow, the frontend first merges/aligns the two datasets into one
    (or, in a simpler flow, the user uploads a single dataset that
    already contains both populations plus a treatment column)."""
    module_config: dict[str, Any] = Field(description="Raw payload validated against MatchingModuleConfig server-side.")


class MatchingRunResponse(BaseModel):
    job_id: str


class JobProgressDTO(BaseModel):
    message: str
    percentage: float | None
    logs: list[str]


class MatchingJobStatusResponse(BaseModel):
    job_id: str
    status: JobStatus
    progress: JobProgressDTO


class DataFramePreviewDTO(BaseModel):
    name: str
    n_rows: int
    n_columns: int
    columns: list[str]
    preview: list[dict[str, Any]]


class MetricValue:
    pass  # float | int | str | bool at runtime; kept loose here like structure.py's MetricValue


class MatchingJobSummaryDTO(BaseModel):
    job_id: str
    status: JobStatus
    created_at: datetime
    dataset_id: str | None
    matching_algorithm: str | None = None
    distance_metric: str | None = None
    use_propensity_score: bool | None = None
    matching_direction: str | None = None
    metrics: dict[str, float | int | str | bool] = Field(default_factory=dict)
    error: str | None = None


class MatchingResultResponse(BaseModel):
    job_id: str
    status: JobStatus
    success: bool
    error: str | None
    metrics: dict[str, float | int | str | bool]
    tables: list[DataFramePreviewDTO]
    datasets: list[DataFramePreviewDTO]
    runtime_seconds: float | None
    config: dict[str, Any] = Field(default_factory=dict)
    """Full provenance for this run: data_config (per-column imputation/
    scaling/encoding actually applied) and module_config (matching design),
    both already stored on AnalysisResult.config by BasePipeline -- this
    field just exposes them at the single-job level (list_matching_jobs
    already reads the same source for its summary)."""


# ---------------------------------------------------------------------- #
# Internal helpers
# ---------------------------------------------------------------------- #
def _serialize_validation_errors(exc: ValidationError) -> list[dict[str, Any]]:
    serialized = []
    for error in exc.errors(include_url=False):
        error = dict(error)
        ctx = error.get("ctx")
        if isinstance(ctx, dict):
            error["ctx"] = {k: (str(v) if isinstance(v, BaseException) else v) for k, v in ctx.items()}
        serialized.append(error)
    return serialized


def _build_matching_job_target(job_id: str, dataset_id: str, module_config: MatchingModuleConfig):
    def target(reporter: JobProgressReporter) -> AnalysisResult:
        reporter.update("Loading dataset and configuration...", percentage=5.0)
        record = dataset_store.get(dataset_id)
        if record.data_config is None:
            raise ValueError(f"Dataset '{dataset_id}' has no DataConfig yet. Call POST /datasets/parse-config first.")

        with tempfile.NamedTemporaryFile(suffix=".parquet", delete=False) as tmp_file:
            tmp_path = Path(tmp_file.name)
        record.dataframe.write_parquet(tmp_path)

        try:
            reporter.update("Running matching pipeline...", percentage=25.0)
            pipeline = BasePipeline(
                module=MatchingModule(),
                dataset_path=tmp_path,
                data_config=record.data_config,
                module_config=module_config,
                # Whether imputation actually runs on any given column is
                # controlled per-column by DataConfig
                # (missing_data_management.strategy == IMPUTE); columns left
                # at MAINTAIN/DROP/REPLACE are untouched by Imputation. This
                # flag only turns the *step* on so a configured strategy is
                # never silently skipped by the GUI's matching pipeline.
                apply_imputation=True,
                output_folder=RUNS_DIR / job_id,
            )
            result = pipeline.run()
        finally:
            tmp_path.unlink(missing_ok=True)

        reporter.update("Matching pipeline finished.", percentage=95.0)
        return result

    return target


def _normalized_result_config(result: AnalysisResult) -> dict[str, Any]:
    """AnalysisResult.config stores data_config as a plain dict keyed by
    column name (DataConfig.to_dict()'s native shape). Every other place
    that exposes column configuration over the API (parse-config) uses a
    list-of-columns-with-a-name-field shape instead (DataConfigDTO). Left
    as-is, a caller reading data_config from a job result vs. from
    parse-config would have to handle two different JSON shapes for the
    same concept. Re-serializing through the same DTO here makes the API
    self-consistent; module_config/execution_context are left untouched.
    """
    config = dict(result.config or {})
    raw_data_config = config.get("data_config")
    if isinstance(raw_data_config, dict):
        try:
            config["data_config"] = _data_config_to_dto(DataConfig.model_validate(raw_data_config)).model_dump(mode="json")
        except Exception:
            pass  # fall back to the raw shape rather than breaking the whole response
    return config


def _dataframe_to_preview_dto(name: str, dataframe) -> DataFramePreviewDTO:
    preview_rows = dataframe.head(_PREVIEW_ROW_LIMIT).to_dicts()
    return DataFramePreviewDTO(name=name, n_rows=dataframe.height, n_columns=dataframe.width, columns=dataframe.columns, preview=preview_rows)


def _job_record_to_status_dto(job_id: str, record) -> MatchingJobStatusResponse:
    return MatchingJobStatusResponse(
        job_id=job_id, status=record.status,
        progress=JobProgressDTO(message=record.progress.message, percentage=record.progress.percentage, logs=record.progress.logs),
    )


# ---------------------------------------------------------------------- #
# Endpoints
# ---------------------------------------------------------------------- #
@router.post("/run", response_model=MatchingRunResponse, status_code=202)
def run_matching_module(
    request: MatchingRunRequest, background_tasks: BackgroundTasks,
    current_user: CurrentUserResponse = Depends(get_current_user),
) -> MatchingRunResponse:
    try:
        dataset_store.get(request.dataset_id)
    except DatasetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    try:
        module_config = MatchingModuleConfig.model_validate(request.module_config)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=_serialize_validation_errors(exc)) from exc

    job_id = job_manager.create_job(dataset_id=request.dataset_id)
    target = _build_matching_job_target(job_id, request.dataset_id, module_config)
    background_tasks.add_task(job_manager.run_job, job_id, target)

    return MatchingRunResponse(job_id=job_id)

@router.get("/jobs", response_model=list[MatchingJobSummaryDTO])
def list_matching_jobs(current_user: CurrentUserResponse = Depends(get_current_user)) -> list[MatchingJobSummaryDTO]:
    """Lists every matching job known to this process, most recent first,
    with just enough of each run's configuration and top-line metrics to
    support a Compare Runs view. No new fields were added to AnalysisResult
    or MatchingOutput for this: everything below is read out of
    `result.config["module_config"]` and `result.metrics`, both of which
    BasePipeline/MatchingModule already populate on every run.
    """
    summaries: list[MatchingJobSummaryDTO] = []
    for record in job_manager.list_jobs():
        summary = MatchingJobSummaryDTO(
            job_id=record.job_id, status=record.status,
            created_at=record.created_at, dataset_id=record.dataset_id,
            error=record.error,
        )
        result = record.result
        if isinstance(result, AnalysisResult):
            module_config = result.config.get("module_config") or {}
            summary.matching_algorithm = module_config.get("strategy", {}).get("matching_algorithm")
            summary.distance_metric = module_config.get("distance", {}).get("distance_metric")
            summary.use_propensity_score = module_config.get("representation", {}).get("use_propensity_score")
            summary.matching_direction = module_config.get("population", {}).get("matching_direction")
            summary.metrics = result.metrics
        summaries.append(summary)
    return summaries


class ExploreRequest(BaseModel):
    dataset_id: str
    treatment_col: str
    matching_covariates: list[str] = Field(min_length=1)


@router.post("/explore", response_model=Any)  # response_model intentionally loose; see note below
def explore_population(request: ExploreRequest, current_user: CurrentUserResponse = Depends(get_current_user)):
    """Synchronous pre-matching population profile: descriptive stats,
    distributions, missingness, correlations for treated vs control.
    Not a background job -- computation is lightweight (seconds), same
    reasoning as the Demo's synchronous execution.
    """
    try:
        record = dataset_store.get(request.dataset_id)
    except DatasetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if request.treatment_col not in record.dataframe.columns:
        raise HTTPException(status_code=422, detail=f"Column '{request.treatment_col}' not found in dataset.")

    missing_covariates = [c for c in request.matching_covariates if c not in record.dataframe.columns]
    if missing_covariates:
        raise HTTPException(status_code=422, detail=f"Covariates not found in dataset: {missing_covariates}")

    dataframe = record.dataframe
    if record.data_config is not None:
        try:
            dataframe = Preprocessing.run(dataframe, record.data_config)
        except Exception:
            pass  # fall back to raw dataframe if preprocessing isn't applicable yet

    profile = PopulationProfiler().compute(dataframe, request.treatment_col, request.matching_covariates)
    return profile.model_dump()


@router.get("/jobs/{job_id}", response_model=MatchingJobStatusResponse)
def get_job_status(job_id: str, current_user: CurrentUserResponse = Depends(get_current_user)) -> MatchingJobStatusResponse:
    try:
        record = job_manager.get_job(job_id)
    except JobNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return _job_record_to_status_dto(job_id, record)


@router.get("/jobs/{job_id}/result", response_model=MatchingResultResponse)
def get_job_result(job_id: str, current_user: CurrentUserResponse = Depends(get_current_user)) -> MatchingResultResponse:
    try:
        record = job_manager.get_job(job_id)
    except JobNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if record.status not in (JobStatus.COMPLETED, JobStatus.FAILED):
        raise HTTPException(status_code=409, detail=f"Job '{job_id}' is not finished yet (status='{record.status.value}').")

    if record.status == JobStatus.FAILED:
        return MatchingResultResponse(job_id=job_id, status=record.status, success=False, error=record.error, metrics={}, tables=[], datasets=[], runtime_seconds=None, config={})

    result = record.result
    
    if not isinstance(result, AnalysisResult):
        raise TypeError(f"Expected AnalysisResult for job '{job_id}', got {type(result).__name__}")

    def format_df(name: str, df) -> dict:
        if hasattr(df, "height") and hasattr(df, "width"):  # Polars
            n_rows = df.height
            n_columns = df.width
            columns = list(df.columns)
            preview = df.head(10).to_dicts()
        elif hasattr(df, "shape"):  # Pandas
            n_rows = df.shape[0]
            n_columns = df.shape[1]
            columns = list(df.columns)
            preview = df.head(10).to_dict(orient="records")
        else:
            raise TypeError(f"Dataset or table '{name}' is neither a Polars nor a Pandas DataFrame.")

        return {
            "name": name,
            "n_rows": n_rows,
            "n_columns": n_columns,
            "columns": columns,
            "preview": preview,
        }

    datasets_list = [format_df(k, v) for k, v in result.datasets.items()] if isinstance(result.datasets, dict) else []
    tables_list = [format_df(k, v) for k, v in result.tables.items()] if isinstance(result.tables, dict) else []

    return MatchingResultResponse(
        job_id=job_id,
        status=record.status,
        success=getattr(result, "success", True),
        error=getattr(result, "error", None),
        metrics=getattr(result, "metrics", {}),
        tables=tables_list,
        datasets=datasets_list,
        runtime_seconds=getattr(result, "runtime_seconds", None),
        config=_normalized_result_config(result),
    )


@router.get("/jobs/{job_id}/download/{collection}/{name}")
def download_dataframe(
    job_id: str, collection: str, name: str,
    current_user: CurrentUserResponse = Depends(get_current_user),
) -> StreamingResponse:
    try:
        record = job_manager.get_job(job_id)
    except JobNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if record.status != JobStatus.COMPLETED:
        raise HTTPException(status_code=409, detail=f"Job '{job_id}' is not completed yet.")

    result: AnalysisResult = record.result
    if collection == "tables":
        source = result.tables
    elif collection == "datasets":
        source = result.datasets
    else:
        raise HTTPException(status_code=400, detail="collection must be 'tables' or 'datasets'.")

    dataframe = source.get(name)
    if dataframe is None:
        raise HTTPException(status_code=404, detail=f"No '{name}' found in {collection} for this job.")

    csv_bytes = dataframe.write_csv().encode("utf-8")
    return StreamingResponse(iter([csv_bytes]), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{name}.csv"'})


@router.get("/jobs/{job_id}/report")
def download_report(job_id: str, current_user: CurrentUserResponse = Depends(get_current_user)) -> FileResponse:
    try:
        record = job_manager.get_job(job_id)
    except JobNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if record.status != JobStatus.COMPLETED:
        raise HTTPException(status_code=409, detail=f"Job '{job_id}' is not completed yet.")

    result: AnalysisResult = record.result
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp_file:
        tmp_path = Path(tmp_file.name)

    ReportManager.generate_pdf(result, tmp_path, title=f"Matching Analysis Report ({job_id})")
    return FileResponse(tmp_path, media_type="application/pdf", filename=f"synapse-matching-report-{job_id}.pdf")