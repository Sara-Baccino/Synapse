"""
synapse_core.dataset.preprocessing
--------------------------------------

Applies a DataConfig to a raw Polars DataFrame (as produced by Loader),
producing the canonical dataframe every analysis module operates on:
active columns selected/renamed, value mappings applied, missing tokens
normalized to real nulls, types cast, multipliers applied, and
strategy="drop" rows removed.

Deliberately does NOT impute or scale -- see imputation.py and
scaling.py, run as separate pipeline steps on the output of this module.
"""

from __future__ import annotations

import polars as pl

from synapse_core.exceptions import ConfigError
from synapse_core.models.column_info import ColumnInfo, MissingStrategy
from synapse_core.models.data_config import DataConfig

__all__ = ["Preprocessing"]


class Preprocessing:
    """Stateless utility that applies a DataConfig to a raw dataframe."""

    @staticmethod
    def run(data: pl.DataFrame, config: DataConfig) -> pl.DataFrame:
        """Apply `config` to `data`, returning the canonical preprocessed dataframe.

        :param data: raw dataframe, as produced by Loader.
        :param config: DataConfig describing how to interpret `data`.
        :raises ConfigError: if an active column declared in `config` is
            missing from `data`.
        :return: preprocessed dataframe, containing only active columns
            (renamed, mapped, type-cast, missing-normalized).
        """
        active_columns = config.active_columns()
        Preprocessing._check_columns_present(data, active_columns)

        result = data.select(list(active_columns.keys()))
        result = Preprocessing._apply_renames(result, active_columns)
        result = Preprocessing._apply_mappings(result, active_columns)
        result = Preprocessing._normalize_missing_tokens(result, active_columns)
        result = Preprocessing._apply_types(result, active_columns)
        result = Preprocessing._apply_multipliers(result, active_columns)
        result = Preprocessing._apply_drop_strategy(result, active_columns)
        result = Preprocessing._apply_replace_strategy(result, active_columns)

        return result

    # ------------------------------------------------------------------ #
    # Individual transformation steps (kept small & independently testable)
    # ------------------------------------------------------------------ #
    @staticmethod
    def _check_columns_present(data: pl.DataFrame, active_columns: dict[str, ColumnInfo]) -> None:
        missing = set(active_columns.keys()) - set(data.columns)
        if missing:
            raise ConfigError(
                f"Active columns declared in DataConfig are missing from dataset: {sorted(missing)}"
            )

    @staticmethod
    def _apply_renames(data: pl.DataFrame, active_columns: dict[str, ColumnInfo]) -> pl.DataFrame:
        rename_map = {
            original: info.new_name
            for original, info in active_columns.items()
            if info.new_name != original
        }
        return data.rename(rename_map) if rename_map else data

    @staticmethod
    def _apply_mappings(data: pl.DataFrame, active_columns: dict[str, ColumnInfo]) -> pl.DataFrame:
        expressions = [
            pl.col(info.new_name).replace(info.mappings)
            for info in active_columns.values()
            if info.mappings
        ]
        return data.with_columns(expressions) if expressions else data

    @staticmethod
    def _normalize_missing_tokens(
        data: pl.DataFrame, active_columns: dict[str, ColumnInfo]
    ) -> pl.DataFrame:
        """Replace raw 'missing' tokens (e.g. 'NA', '') with real Polars nulls.

        Applied for every strategy except MAINTAIN, since MAINTAIN means
        the column is left exactly as-is, tokens included.
        """
        expressions = []
        for info in active_columns.values():
            mdm = info.missing_data_management
            if mdm.strategy == MissingStrategy.MAINTAIN or not mdm.condition:
                continue
            expressions.append(
                pl.when(pl.col(info.new_name).is_in(mdm.condition))
                .then(None)
                .otherwise(pl.col(info.new_name))
                .alias(info.new_name)
            )
        return data.with_columns(expressions) if expressions else data

    @staticmethod
    def _apply_types(data: pl.DataFrame, active_columns: dict[str, ColumnInfo]) -> pl.DataFrame:
        expressions = [
            pl.col(info.new_name).cast(Preprocessing._to_polars_dtype(info), strict=False)
            for info in active_columns.values()
            if info.type is not None
        ]
        return data.with_columns(expressions) if expressions else data

    @staticmethod
    def _apply_multipliers(data: pl.DataFrame, active_columns: dict[str, ColumnInfo]) -> pl.DataFrame:
        expressions = [
            (pl.col(info.new_name) * info.multiplier).alias(info.new_name)
            for info in active_columns.values()
            if info.numerical and info.multiplier != 1
        ]
        return data.with_columns(expressions) if expressions else data

    @staticmethod
    def _apply_drop_strategy(data: pl.DataFrame, active_columns: dict[str, ColumnInfo]) -> pl.DataFrame:
        drop_columns = [
            info.new_name
            for info in active_columns.values()
            if info.missing_data_management.strategy == MissingStrategy.DROP
        ]
        if not drop_columns:
            return data
        return data.filter(pl.all_horizontal([pl.col(c).is_not_null() for c in drop_columns]))

    @staticmethod
    def _apply_replace_strategy(data: pl.DataFrame, active_columns: dict[str, ColumnInfo]) -> pl.DataFrame:
        expressions = [
            pl.col(info.new_name).fill_null(info.missing_data_management.value)
            for info in active_columns.values()
            if info.missing_data_management.strategy == MissingStrategy.REPLACE
        ]
        return data.with_columns(expressions) if expressions else data

    @staticmethod
    def _to_polars_dtype(info: ColumnInfo) -> pl.DataType:
        mapping: dict[str, pl.DataType] = {
            "int": pl.Int64,
            "int64": pl.Int64,
            "int32": pl.Int32,
            "float": pl.Float64,
            "float64": pl.Float64,
            "float32": pl.Float32,
            "string": pl.Utf8,
            "bool": pl.Boolean,
            "date": pl.Date,
            "datetime": pl.Datetime,
            "category": pl.Categorical,
        }
        return mapping[info.type.value]
