"""
synapse_core.dataset.scaling
--------------------------------

Applies per-column ScalingConfig (declared in ColumnInfo) to a
preprocessed dataframe. Fit and transform are deliberately separate,
mirroring scikit-learn's API: fitted scalers are returned as a plain
artifact dict, never embedded into the config, so the same fitted state
can be reused to transform a second dataset (e.g. scaling a synthetic
dataset into the same space fitted on the real one).
"""

from __future__ import annotations

import polars as pl
from sklearn.base import TransformerMixin
from sklearn.preprocessing import MinMaxScaler, RobustScaler, StandardScaler

from synapse_core.exceptions import ConfigError
from synapse_core.models.column_info import ColumnInfo, ScalerType
from synapse_core.models.data_config import DataConfig

__all__ = ["Scaling", "FittedScalers"]

FittedScalers = dict[str, TransformerMixin]
"""Column name -> fitted sklearn transformer. Lives outside DataConfig."""

_SCALER_FACTORIES: dict[ScalerType, type[TransformerMixin]] = {
    ScalerType.STANDARD: StandardScaler,
    ScalerType.MINMAX: MinMaxScaler,
    ScalerType.ROBUST: RobustScaler,
}


class Scaling:
    """Stateless utility for fitting/applying per-column scalers."""

    @staticmethod
    def fit_transform(data: pl.DataFrame, config: DataConfig) -> tuple[pl.DataFrame, FittedScalers]:
        """Fit a scaler per column with scaling enabled, and apply it.

        :param data: preprocessed dataframe (see Preprocessing.run).
        :param config: DataConfig describing which columns to scale and how.
        :return: (scaled dataframe, fitted scalers keyed by column name).
        :raises ConfigError: if a column marked for scaling is missing or non-numeric.
        """
        columns_to_scale = config.scaled_columns()
        Scaling._check_scalable(data, config, columns_to_scale)

        fitted_scalers: FittedScalers = {}
        expressions = []

        for column_name in columns_to_scale:
            info = config[column_name]
            scaler = _SCALER_FACTORIES[info.scaling.method]()

            values = data[column_name].to_numpy().reshape(-1, 1)
            scaled_values = scaler.fit_transform(values).reshape(-1)

            fitted_scalers[column_name] = scaler
            expressions.append(pl.Series(name=column_name, values=scaled_values))

        result = data.with_columns(expressions) if expressions else data
        return result, fitted_scalers

    @staticmethod
    def transform(data: pl.DataFrame, config: DataConfig, fitted_scalers: FittedScalers) -> pl.DataFrame:
        """Apply already-fitted scalers to a (possibly different) dataframe.

        Useful for projecting a second dataset (e.g. synthetic data, or a
        second population in matching) into the same scaled space fitted
        on the primary dataset.

        :param data: dataframe to transform; must contain every column in `fitted_scalers`.
        :param config: DataConfig used only to know which columns are scaled.
        :param fitted_scalers: scalers previously produced by `fit_transform`.
        :raises ConfigError: if a required fitted scaler is missing, or a
            scaled column is absent from `data`.
        """
        columns_to_scale = config.scaled_columns()
        missing_scalers = set(columns_to_scale) - set(fitted_scalers.keys())
        if missing_scalers:
            raise ConfigError(
                f"No fitted scaler available for column(s): {sorted(missing_scalers)}"
            )
        Scaling._check_scalable(data, config, columns_to_scale)

        expressions = []
        for column_name in columns_to_scale:
            scaler = fitted_scalers[column_name]
            values = data[column_name].to_numpy().reshape(-1, 1)
            scaled_values = scaler.transform(values).reshape(-1)
            expressions.append(pl.Series(name=column_name, values=scaled_values))

        return data.with_columns(expressions) if expressions else data

    @staticmethod
    def inverse_transform(
        data: pl.DataFrame, config: DataConfig, fitted_scalers: FittedScalers
    ) -> pl.DataFrame:
        """Undo scaling, restoring original units. Useful for reporting
        results (e.g. cluster centroids) in human-readable scale.
        """
        columns_to_scale = config.scaled_columns()
        missing_scalers = set(columns_to_scale) - set(fitted_scalers.keys())
        if missing_scalers:
            raise ConfigError(
                f"No fitted scaler available for column(s): {sorted(missing_scalers)}"
            )

        expressions = []
        for column_name in columns_to_scale:
            scaler = fitted_scalers[column_name]
            values = data[column_name].to_numpy().reshape(-1, 1)
            original_values = scaler.inverse_transform(values).reshape(-1)
            expressions.append(pl.Series(name=column_name, values=original_values))

        return data.with_columns(expressions) if expressions else data

    @staticmethod
    def _check_scalable(data: pl.DataFrame, config: DataConfig, columns: list[str]) -> None:
        missing = [c for c in columns if c not in data.columns]
        if missing:
            raise ConfigError(f"Scaled columns missing from dataset: {missing}")

        non_numeric = [c for c in columns if not data[c].dtype.is_numeric()]
        if non_numeric:
            raise ConfigError(f"Cannot scale non-numeric column(s): {non_numeric}")
