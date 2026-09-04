"""
synapse_gui.routers.datasets
------------------------------------

Dataset upload, DataConfig build/validation/import, existence check,
and artifact promotion -- recycled from synclair-gui's datasets.py
(Phase 1 plan), plus a Synapse-specific two-dataset compatibility check
needed for the matching workflow (two datasets, common covariates).
"""

from __future__ import annotations

import json
import tempfile
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from synapse_core.dataset.config_builder import ConfigBuilder
from synapse_core.dataset.config_reader import ConfigReader
from synapse_core.dataset.loader import Loader
from synapse_core.exceptions import ConfigParseError, DatasetLoadError
from synapse_core.models.analysis_result import AnalysisResult
from synapse_core.models.column_info import ColumnInfo
from synapse_core.models.data_config import DataConfig

from synapse_gui.routers.auth import CurrentUserResponse, get_current_user
from synapse_gui.services.dataset_compatibility import check_dataset_compatibility
from synapse_gui.services.dataset_store import DatasetNotFoundError, dataset_store
from synapse_gui.services.job_manager import JobNotFoundError, JobStatus, job_manager

__all__ = ["router"]

router = APIRouter(prefix="/datasets", tags=["datasets"])


# ---------------------------------------------------------------------- #
# DTOs
# ---------------------------------------------------------------------- #
class ColumnPreviewDTO(BaseModel):
    name: str
    dtype: str


class DatasetUploadResponse(BaseModel):
    dataset_id: str
    filename: str
    n_rows: int
    n_columns: int
    columns: list[ColumnPreviewDTO]
    preview: list[dict[str, Any]]


class DatasetDetailResponse(BaseModel):
    dataset_id: str
    filename: str
    n_rows: int
    n_columns: int
    has_data_config: bool


class MissingDataManagementDTO(BaseModel):
    strategy: str
    value: Any | None = None
    condition: list[Any]
    imputer: str


class ScalingConfigDTO(BaseModel):
    enabled: bool
    method: str


class EncodingConfigDTO(BaseModel):
    enabled: bool
    method: str
    order: list[Any] | None = None


class ColumnInfoDTO(BaseModel):
    name: str
    new_name: str
    active: bool
    categorical: bool
    numerical: bool
    id: bool
    semantic_roles: list[str]
    multiplier: float
    mappings: dict[str, Any]
    missing_data_management: MissingDataManagementDTO
    scaling: ScalingConfigDTO
    encoding: EncodingConfigDTO
    type: str | None


class DataConfigDTO(BaseModel):
    columns: list[ColumnInfoDTO]


class ConfigValidationDTO(BaseModel):
    is_valid: bool
    missing_in_dataset: list[str]
    unconfigured_in_dataset: list[str]
    errors: list[str]


class ParseConfigRequest(BaseModel):
    dataset_id: str
    existing_config: dict[str, Any] | None = None
    id_columns: list[str] | None = None
    infer_id: bool = True
    custom_id_patterns: list[str] | None = None


class ParseConfigResponse(BaseModel):
    dataset_id: str
    data_config: DataConfigDTO
    validation: ConfigValidationDTO


class RowFilterCondition(BaseModel):
    column: str
    operator: Literal["eq", "ne", "in", "not_in", "gt", "gte", "lt", "lte"]
    value: Any


class FromArtifactRequest(BaseModel):
    source_job_id: str
    artifact_name: str = Field(description="Key in AnalysisResult.datasets to promote.")
    row_filters: list[RowFilterCondition] = Field(default_factory=list)
    new_filename: str | None = None


class LegacyFieldMapping(BaseModel):
    column: str
    legacy_field: str
    legacy_value: Any
    mapped_to: str


class ImportConfigResponse(BaseModel):
    dataset_id: str
    data_config: DataConfigDTO
    validation: ConfigValidationDTO
    fallback_used: bool
    fallback_reason: str | None = None
    legacy_fields_mapped: list[LegacyFieldMapping] = []


class CompatibilityCheckRequest(BaseModel):
    dataset_id_a: str
    dataset_id_b: str


class CompatibilityCheckResponse(BaseModel):
    is_compatible: bool
    common_columns: list[str]
    excluded_id_like_columns: list[str]


# ---------------------------------------------------------------------- #
# Mapping helpers
# ---------------------------------------------------------------------- #
def _column_info_to_dto(name: str, info: ColumnInfo) -> ColumnInfoDTO:
    return ColumnInfoDTO(
        name=name, new_name=info.new_name, active=info.active,
        categorical=info.categorical, numerical=info.numerical, id=info.id,
        semantic_roles=sorted(info.semantic_roles), multiplier=info.multiplier, mappings=info.mappings,
        missing_data_management=MissingDataManagementDTO(
            strategy=info.missing_data_management.strategy.value,
            value=info.missing_data_management.value,
            condition=info.missing_data_management.condition,
            imputer=info.missing_data_management.imputer.value,
        ),
        scaling=ScalingConfigDTO(enabled=info.scaling.enabled, method=info.scaling.method.value),
        encoding=EncodingConfigDTO(enabled=info.encoding.enabled, method=info.encoding.method.value, order=info.encoding.order),
        type=info.type.value if info.type is not None else None,
    )


def _data_config_to_dto(config: DataConfig) -> DataConfigDTO:
    return DataConfigDTO(columns=[_column_info_to_dto(name, info) for name, info in config.items()])


def _apply_row_filter(dataframe, condition: RowFilterCondition):
    import polars as pl

    if condition.column not in dataframe.columns:
        raise ValueError(f"Column '{condition.column}' not found.")

    dtype = dataframe.schema[condition.column]
    value = condition.value

    if condition.operator in ("in", "not_in") and isinstance(value, list):
        value = pl.Series(value).cast(dtype, strict=False).to_list()
    else:
        value = pl.Series([value]).cast(dtype, strict=False).to_list()[0]

    col = pl.col(condition.column)
    op_map = {
        "eq": col == value, "ne": col != value,
        "in": col.is_in(value), "not_in": ~col.is_in(value),
        "gt": col > value, "gte": col >= value, "lt": col < value, "lte": col <= value,
    }
    return dataframe.filter(op_map[condition.operator])


_KNOWN_LEGACY_BOOLEAN_ROLE_FIELDS = ["gene", "cytogenetic", "clinical"]
_RECOGNIZED_COLUMN_INFO_FIELDS = {
    "new_name", "active", "categorical", "numerical", "id",
    "semantic_roles", "multiplier", "mappings",
    "missing_data_management", "scaling", "encoding", "type",
}


def _sanitize_legacy_column_config(column_name: str, raw_column: dict[str, Any]) -> tuple[dict[str, Any], list[LegacyFieldMapping]]:
    sanitized: dict[str, Any] = {}
    mappings_report: list[LegacyFieldMapping] = []
    semantic_roles: set[str] = set(raw_column.get("semantic_roles", []))

    for key, value in raw_column.items():
        if key in _RECOGNIZED_COLUMN_INFO_FIELDS:
            sanitized[key] = value
        elif key in _KNOWN_LEGACY_BOOLEAN_ROLE_FIELDS:
            if value is True:
                semantic_roles.add(key)
                mappings_report.append(LegacyFieldMapping(column=column_name, legacy_field=key, legacy_value=value, mapped_to="semantic_roles"))
            else:
                mappings_report.append(LegacyFieldMapping(column=column_name, legacy_field=key, legacy_value=value, mapped_to="ignored"))
        else:
            mappings_report.append(LegacyFieldMapping(column=column_name, legacy_field=key, legacy_value=value, mapped_to="ignored"))

    sanitized["semantic_roles"] = sorted(semantic_roles)
    return sanitized, mappings_report


# ---------------------------------------------------------------------- #
# Endpoints
# ---------------------------------------------------------------------- #
@router.post("/upload", response_model=DatasetUploadResponse)
async def upload_dataset(
    file: UploadFile = File(...),
    current_user: CurrentUserResponse = Depends(get_current_user),
) -> DatasetUploadResponse:
    original_name = file.filename or "dataset"
    extension = Path(original_name).suffix.lower()

    if extension not in Loader.supported_extensions():
        raise HTTPException(status_code=400, detail=f"Unsupported file extension '{extension}'. Supported: {Loader.supported_extensions()}")

    contents = await file.read()
    with tempfile.NamedTemporaryFile(suffix=extension, delete=False) as tmp_file:
        tmp_file.write(contents)
        tmp_path = Path(tmp_file.name)

    try:
        dataframe = Loader.load(tmp_path)
    except DatasetLoadError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        tmp_path.unlink(missing_ok=True)

    record = dataset_store.add(filename=original_name, dataframe=dataframe)
    columns = [ColumnPreviewDTO(name=c, dtype=str(dataframe.schema[c])) for c in dataframe.columns]

    return DatasetUploadResponse(
        dataset_id=record.dataset_id, filename=record.filename,
        n_rows=dataframe.height, n_columns=dataframe.width,
        columns=columns, preview=dataframe.head(5).to_dicts(),
    )


@router.get("/{dataset_id}", response_model=DatasetDetailResponse)
def get_dataset(dataset_id: str, current_user: CurrentUserResponse = Depends(get_current_user)) -> DatasetDetailResponse:
    try:
        record = dataset_store.get(dataset_id)
    except DatasetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return DatasetDetailResponse(
        dataset_id=record.dataset_id, filename=record.filename,
        n_rows=record.dataframe.height, n_columns=record.dataframe.width,
        has_data_config=record.data_config is not None,
    )


@router.post("/parse-config", response_model=ParseConfigResponse)
def parse_config(request: ParseConfigRequest, current_user: CurrentUserResponse = Depends(get_current_user)) -> ParseConfigResponse:
    try:
        record = dataset_store.get(request.dataset_id)
    except DatasetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if request.existing_config is not None:
        try:
            data_config = ConfigReader.from_dict(request.existing_config)
        except ConfigParseError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
    else:
        data_config = ConfigBuilder.build_config(
            record.dataframe, id_columns=request.id_columns,
            infer_id=request.infer_id, custom_id_patterns=request.custom_id_patterns,
        )

    validation = ConfigBuilder.validate_config(record.dataframe, data_config)
    dataset_store.set_data_config(request.dataset_id, data_config)

    return ParseConfigResponse(
        dataset_id=request.dataset_id, data_config=_data_config_to_dto(data_config),
        validation=ConfigValidationDTO(
            is_valid=validation.is_valid, missing_in_dataset=validation.missing_in_dataset,
            unconfigured_in_dataset=validation.unconfigured_in_dataset, errors=validation.errors,
        ),
    )


@router.post("/{dataset_id}/import-config", response_model=ImportConfigResponse)
async def import_config_file(
    dataset_id: str, file: UploadFile = File(...),
    current_user: CurrentUserResponse = Depends(get_current_user),
) -> ImportConfigResponse:
    try:
        record = dataset_store.get(dataset_id)
    except DatasetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    raw_bytes = await file.read()
    fallback_used = False
    fallback_reason: str | None = None
    legacy_fields_mapped: list[LegacyFieldMapping] = []

    try:
        raw_json = json.loads(raw_bytes)
        columns_payload = raw_json.get("columns", raw_json)

        sanitized_columns: dict[str, Any] = {}
        for column_name, raw_column in columns_payload.items():
            sanitized, mapping_report = _sanitize_legacy_column_config(column_name, raw_column)
            sanitized_columns[column_name] = sanitized
            legacy_fields_mapped.extend(mapping_report)

        data_config = ConfigReader.from_dict({"columns": sanitized_columns})
    except (json.JSONDecodeError, ConfigParseError, AttributeError, KeyError) as exc:
        fallback_used = True
        fallback_reason = f"Could not parse uploaded config.json ({exc}); built configuration automatically instead."
        data_config = ConfigBuilder.build_config(record.dataframe, infer_id=False)
        legacy_fields_mapped = []

    validation = ConfigBuilder.validate_config(record.dataframe, data_config)
    dataset_store.set_data_config(dataset_id, data_config)

    return ImportConfigResponse(
        dataset_id=dataset_id, data_config=_data_config_to_dto(data_config),
        validation=ConfigValidationDTO(
            is_valid=validation.is_valid, missing_in_dataset=validation.missing_in_dataset,
            unconfigured_in_dataset=validation.unconfigured_in_dataset, errors=validation.errors,
        ),
        fallback_used=fallback_used, fallback_reason=fallback_reason, legacy_fields_mapped=legacy_fields_mapped,
    )


@router.post("/check-compatibility", response_model=CompatibilityCheckResponse)
def check_compatibility(
    request: CompatibilityCheckRequest, current_user: CurrentUserResponse = Depends(get_current_user)
) -> CompatibilityCheckResponse:
    """Checks whether two uploaded datasets share at least one common
    non-id column usable as a matching covariate. Synapse-specific
    (two-dataset workflow), not part of synapse_core.
    """
    try:
        record_a = dataset_store.get(request.dataset_id_a)
        record_b = dataset_store.get(request.dataset_id_b)
    except DatasetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    result = check_dataset_compatibility(record_a.dataframe, record_b.dataframe)
    return CompatibilityCheckResponse(
        is_compatible=result.is_compatible,
        common_columns=result.common_columns,
        excluded_id_like_columns=result.excluded_id_like_columns,
    )


@router.post("/from-artifact", response_model=DatasetUploadResponse)
def create_dataset_from_artifact(
    request: FromArtifactRequest, current_user: CurrentUserResponse = Depends(get_current_user)
) -> DatasetUploadResponse:
    try:
        record = job_manager.get_job(request.source_job_id)
    except JobNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if record.status != JobStatus.COMPLETED:
        raise HTTPException(status_code=409, detail=f"Job '{request.source_job_id}' is not completed (status='{record.status.value}').")

    result: AnalysisResult = record.result
    if not result.success:
        raise HTTPException(status_code=409, detail="Source job did not complete successfully.")

    dataframe = result.datasets.get(request.artifact_name)
    if dataframe is None:
        raise HTTPException(status_code=404, detail=f"No artifact named '{request.artifact_name}' found. Available: {sorted(result.datasets.keys())}")

    for condition in request.row_filters:
        if condition.column not in dataframe.columns:
            raise HTTPException(status_code=422, detail=f"row_filter column '{condition.column}' not found in artifact.")
        try:
            dataframe = _apply_row_filter(dataframe, condition)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Invalid row_filter for column '{condition.column}': {exc}") from exc

    if dataframe.height == 0:
        raise HTTPException(status_code=422, detail="row_filters produced an empty dataset.")

    filename = request.new_filename or f"{request.artifact_name}__from_{request.source_job_id[:8]}"
    new_record = dataset_store.add(filename=filename, dataframe=dataframe)
    columns = [ColumnPreviewDTO(name=c, dtype=str(dataframe.schema[c])) for c in dataframe.columns]

    return DatasetUploadResponse(
        dataset_id=new_record.dataset_id, filename=new_record.filename,
        n_rows=dataframe.height, n_columns=dataframe.width,
        columns=columns, preview=dataframe.head(5).to_dicts(),
    )