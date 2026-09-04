"""
synapse_gui.routers.demo
--------------------------------

Public, unauthenticated demo endpoints: run MatchingModule synchronously
against a fixed synthetic dataset with real selection bias, so visitors
can see pre/post-match balance improve without an account. Same
statelessness guarantees as synclair-gui's demo.py: never touches
dataset_store or job_manager.
"""

from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from synapse_core.dataset.config_builder import ConfigBuilder
from synapse_core.models.analysis_result import AnalysisResult
from synapse_core.pipeline.base_pipeline import BasePipeline

from synapse_gui.services.matching_demo_datasets import (
    DEMO_MATCHING_DATASETS, DemoMatchingDatasetNotFoundError, get_demo_matching_dataset,
)

from synapse_matching.config.matching_module_config import MatchingModuleConfig
from synapse_matching.pipeline.matching_module import MatchingModule

__all__ = ["router"]

router = APIRouter(prefix="/demo", tags=["demo"])

DemoDatasetName = Literal["clinical_selection_bias"]


class DemoToolDTO(BaseModel):
    id: str
    title: str
    description: str


class DemoDatasetDTO(BaseModel):
    name: str
    title: str
    description: str


class DemoToolsResponse(BaseModel):
    tools: list[DemoToolDTO]
    demo_datasets: list[DemoDatasetDTO]


class DemoMatchingRunRequest(BaseModel):
    dataset_name: DemoDatasetName
    matching_covariates: list[str] = Field(default_factory=lambda: ["age", "clinical_score"])
    use_propensity_score: bool = True
    matching_algorithm: Literal["greedy_nn", "optimal_hungarian"] = "greedy_nn"


class DemoMatchingRunResponse(BaseModel):
    dataset_name: str
    n_observations: int
    metrics: dict[str, float | int | str | bool]
    balance_table: list[dict]
    success: bool
    error: str | None


@router.get("/tools", response_model=DemoToolsResponse)
def list_demo_tools() -> DemoToolsResponse:
    tools = [DemoToolDTO(id="matching", title="Population Matching", description="Propensity-score and distance-based matching between treated and control groups.")]
    demo_datasets = [DemoDatasetDTO(name=d.name, title=d.title, description=d.description) for d in DEMO_MATCHING_DATASETS.values()]
    return DemoToolsResponse(tools=tools, demo_datasets=demo_datasets)


@router.post("/matching/run", response_model=DemoMatchingRunResponse)
def run_demo_matching(request: DemoMatchingRunRequest) -> DemoMatchingRunResponse:
    try:
        demo_dataset = get_demo_matching_dataset(request.dataset_name)
    except DemoMatchingDatasetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    dataframe = demo_dataset.build()
    data_config = ConfigBuilder.build_config(dataframe, id_columns=["patient_id"])

    module_config = MatchingModuleConfig(
        population={"treatment_col": "treatment", "matching_direction": "treated_to_control"},
        covariates={"matching_covariates": request.matching_covariates},
        representation={"use_propensity_score": request.use_propensity_score},
        strategy={"matching_algorithm": request.matching_algorithm, "allow_replacement": request.matching_algorithm == "greedy_nn"},
    )

    with tempfile.NamedTemporaryFile(suffix=".parquet", delete=False) as tmp_file:
        tmp_path = Path(tmp_file.name)
    dataframe.write_parquet(tmp_path)

    try:
        pipeline = BasePipeline(module=MatchingModule(), dataset_path=tmp_path, data_config=data_config, module_config=module_config, apply_imputation=False)
        result: AnalysisResult = pipeline.run()
    finally:
        tmp_path.unlink(missing_ok=True)

    balance_table = result.tables.get("balance_table")
    return DemoMatchingRunResponse(
        dataset_name=request.dataset_name, n_observations=dataframe.height,
        metrics=result.metrics, balance_table=balance_table.to_dicts() if balance_table is not None else [],
        success=result.success, error=result.error,
    )