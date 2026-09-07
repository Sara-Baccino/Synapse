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

        is_temporal = column_type in (ColumnType.DATE, ColumnType.DATETIME)
        if is_temporal:
            return ColumnInfo(new_name=column_name, type=column_type)

        categorical, numerical, semantic_roles = ConfigBuilder._infer_semantic_type(series, dtype)

        return ColumnInfo(
            new_name=column_name,
            numerical=numerical,
            categorical=categorical,
            semantic_roles=semantic_roles,
            type=column_type,
        )

    @staticmethod
    def _infer_semantic_type(
        series: pl.Series, dtype: pl.DataType
    ) -> tuple[bool, bool, set[str]]:
        """Infer the categorical/numerical flag plus a descriptive semantic tag.

        This is the single, explicit, conservative rule used whenever no
        DataConfig is supplied by the user (a user-provided DataConfig
        always takes precedence and never goes through this method):

        - `pl.Boolean` columns, and numeric columns whose non-null distinct
          values are a subset of {0, 1}, are treated as `binary` categorical
          (`categorical=True`, `numerical=False`). This is the fix for the
          case this method used to get wrong: a 0/1-coded flag is a
          dichotomous category, not a continuous measurement, even though
          its physical dtype is numeric.
        - Other numeric integer dtypes are tagged `discrete` (still
          `numerical=True`).
        - Other numeric float dtypes are tagged `continuous` if any non-null
          value has a fractional part, otherwise `discrete` (still
          `numerical=True` either way -- this only changes the descriptive
          tag, never the operational flag, since a whole-valued float is
          still a genuine measurement, not a category).
        - Everything else (string/category dtypes) is `categorical=True`
          with no automatic tag: nominal vs. ordinal cannot be inferred from
          values alone and is intentionally left for the user to declare
          explicitly (e.g. via `encoding.order`).

        No other heuristic is applied. An empty/all-null column falls back
        to the dtype-only classification with no semantic tag, since there
        is no data to conservatively judge a role from.
        """
        if dtype == pl.Boolean:
            return True, False, {"binary"}

        if not dtype.is_numeric():
            return True, False, set()

        non_null = series.drop_nulls()
        if non_null.len() == 0:
            # No data to inspect: keep the dtype-only classification, no tag.
            return False, True, set()

        distinct_values = set(non_null.unique().to_list())
        if distinct_values.issubset({0, 1}):
            return True, False, {"binary"}

        is_integer_dtype = dtype in (
            pl.Int8, pl.Int16, pl.Int32, pl.Int64,
            pl.UInt8, pl.UInt16, pl.UInt32, pl.UInt64,
        )
        if is_integer_dtype:
            return False, True, {"discrete"}

        # Float dtype, non-binary: discrete if every value is whole-numbered,
        # continuous otherwise.
        has_fractional_part = bool((non_null != non_null.floor()).any())
        return False, True, ({"continuous"} if has_fractional_part else {"discrete"})

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