"""
synapse_core.dataset.config_builder
--------------------------------------

Builds a starting DataConfig from a real Polars dataframe, and validates
an existing DataConfig against a dataframe. This is the only place in
synapse-core where dataset inspection and configuration construction
meet; everything here is stateless.
"""

from __future__ import annotations

import re

import polars as pl
from pydantic import BaseModel, ConfigDict

from synapse_core.models.column_info import ColumnInfo, ColumnType
from synapse_core.models.data_config import DataConfig

__all__ = ["ConfigValidationResult", "ConfigBuilder"]


DEFAULT_ID_PATTERN = r"(^id$|_id$|^id_|^uuid$)"

_POLARS_TO_COLUMN_TYPE: dict[type, ColumnType] = {
    pl.Int8: ColumnType.INT,
    pl.Int16: ColumnType.INT,
    pl.Int32: ColumnType.INT32,
    pl.Int64: ColumnType.INT64,
    pl.UInt8: ColumnType.INT,
    pl.UInt16: ColumnType.INT,
    pl.UInt32: ColumnType.INT32,
    pl.UInt64: ColumnType.INT64,
    pl.Float32: ColumnType.FLOAT32,
    pl.Float64: ColumnType.FLOAT64,
    pl.Utf8: ColumnType.STRING,
    pl.Boolean: ColumnType.BOOL,
    pl.Date: ColumnType.DATE,
    pl.Datetime: ColumnType.DATETIME,
}


class ConfigValidationResult(BaseModel):
    """Structured outcome of validating a DataConfig against a dataframe."""

    model_config = ConfigDict(extra="forbid")

    is_valid: bool
    missing_in_dataset: list[str] = []
    """Active columns declared in the config but absent from the dataframe."""
    unconfigured_in_dataset: list[str] = []
    """Columns present in the dataframe but not described by the config (informational)."""
    errors: list[str] = []


class ConfigBuilder:
    """Stateless utility for building and validating DataConfig objects."""

    @staticmethod
    def build_config(
        data: pl.DataFrame,
        id_columns: list[str] | None = None,
        infer_id: bool = True,
        custom_id_patterns: list[str] | None = None,
    ) -> DataConfig:
        """Build a starting DataConfig by inspecting a real dataframe.

        :param data: input dataframe used to infer column metadata.
        :param id_columns: column names to force-mark as identifiers.
        :param infer_id: if True, also mark as id any column whose name
            matches an identifier pattern (default pattern plus any
            provided via `custom_id_patterns`).
        :param custom_id_patterns: additional regex patterns (raw strings)
            used, in OR with the default pattern, to detect id columns by
            name. Lets each domain extend id-detection (e.g. r"_uid$",
            r"^patient_code$") without touching the default heuristic.
        :return: a DataConfig with one ColumnInfo per column in `data`.
        """
        forced_ids = set(id_columns or [])
        id_regexes = ConfigBuilder._compile_id_patterns(custom_id_patterns)

        columns: dict[str, ColumnInfo] = {}

        for column in data.columns:
            is_id = column in forced_ids or (
                infer_id and ConfigBuilder._matches_any(column, id_regexes)
            )
            columns[column] = ConfigBuilder._infer_column_info(
                series=data[column], column_name=column, is_id=is_id
            )

        return DataConfig(columns=columns)

    @staticmethod
    def _compile_id_patterns(custom_id_patterns: list[str] | None) -> list[re.Pattern[str]]:
        patterns = [DEFAULT_ID_PATTERN, *(custom_id_patterns or [])]
        return [re.compile(pattern, re.IGNORECASE) for pattern in patterns]

    @staticmethod
    def _matches_any(column_name: str, patterns: list[re.Pattern[str]]) -> bool:
        return any(pattern.search(column_name) for pattern in patterns)

    @staticmethod
    def _infer_column_info(series: pl.Series, column_name: str, is_id: bool) -> ColumnInfo:
        dtype = series.dtype
        column_type = ConfigBuilder._map_polars_dtype(dtype)

        if is_id:
            return ColumnInfo(new_name=column_name, id=True, type=column_type)

        is_numeric = dtype.is_numeric()
        is_temporal = column_type in (ColumnType.DATE, ColumnType.DATETIME)

        return ColumnInfo(
            new_name=column_name,
            numerical=is_numeric,
            categorical=(not is_numeric and not is_temporal),
            type=column_type,
        )

    @staticmethod
    def _map_polars_dtype(dtype: pl.DataType) -> ColumnType | None:
        for polars_type, column_type in _POLARS_TO_COLUMN_TYPE.items():
            if dtype == polars_type:
                return column_type
        return None

    @staticmethod
    def validate_config(data: pl.DataFrame, config: DataConfig) -> ConfigValidationResult:
        """Validate a DataConfig against a real dataframe.

        Checks that every *active* configured column actually exists in
        the dataframe. Columns present in the dataframe but absent from
        the config are reported as informational, not as errors -- a
        partially-configured dataset is a normal intermediate state.
        """
        active_names = set(config.column_names(active_only=True))
        dataset_names = set(data.columns)

        missing_in_dataset = sorted(active_names - dataset_names)
        unconfigured_in_dataset = sorted(dataset_names - set(config.columns.keys()))

        errors: list[str] = []
        if missing_in_dataset:
            errors.append(
                f"Config declares active columns not found in dataset: {missing_in_dataset}"
            )

        return ConfigValidationResult(
            is_valid=not errors,
            missing_in_dataset=missing_in_dataset,
            unconfigured_in_dataset=unconfigured_in_dataset,
            errors=errors,
        )
