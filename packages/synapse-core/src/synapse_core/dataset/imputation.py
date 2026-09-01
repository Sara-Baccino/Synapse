"""
synapse_core.dataset.imputation
-----------------------------------

Imputes missing values (already normalized to real nulls by
Preprocessing) for columns with missing_data_management.strategy ==
IMPUTE. Univariate imputers (zero, mean, median, most_frequent) are
fitted independently per column. Multivariate imputers (knn, iterative)
are fitted once per method over the shared numerical context and reused
across every column requesting that method -- mirroring how SAFE's KNN
imputer used the whole dataframe as context, but doing so consistently
across all requesting columns instead of column-by-column.
"""

from __future__ import annotations

from collections import defaultdict

import numpy as np
import polars as pl
from sklearn.experimental import enable_iterative_imputer  # noqa: F401 - required by sklearn
from sklearn.impute import IterativeImputer, KNNImputer, SimpleImputer

from synapse_core.exceptions import ConfigError
from synapse_core.models.column_info import ImputerType, MissingStrategy
from synapse_core.models.data_config import DataConfig

__all__ = ["Imputation", "FittedImputers"]

Imputer = SimpleImputer | KNNImputer | IterativeImputer
FittedImputers = dict[str, Imputer]
"""Column name -> fitted sklearn imputer. Lives outside DataConfig.
Columns sharing a multivariate imputer (knn/iterative) reference the
same fitted instance."""

_UNIVARIATE_STRATEGIES: dict[ImputerType, str] = {
    ImputerType.ZERO: "constant",
    ImputerType.MEAN: "mean",
    ImputerType.MEDIAN: "median",
    ImputerType.MOST_FREQUENT: "most_frequent",
}

_NUMERIC_ONLY_METHODS = {ImputerType.MEAN, ImputerType.MEDIAN, ImputerType.KNN, ImputerType.ITERATIVE}


class Imputation:
    """Stateless utility for fitting/applying per-column imputers."""

    @staticmethod
    def fit_transform(data: pl.DataFrame, config: DataConfig) -> tuple[pl.DataFrame, FittedImputers]:
        """Fit imputers for every column with strategy == IMPUTE, and apply them.

        :param data: preprocessed dataframe with missing tokens already
            normalized to real nulls (see Preprocessing.run).
        :param config: DataConfig describing which columns to impute and how.
        :return: (imputed dataframe, fitted imputers keyed by column name).
        :raises ConfigError: if an imputed column is missing, or a
            numeric-only method is requested on a non-numeric column.
        """
        target_columns = Imputation._impute_columns(config)
        Imputation._check_present(data, target_columns)
        Imputation._check_numeric_compatibility(data, config, target_columns)

        fitted_imputers: FittedImputers = {}
        result = data

        univariate, multivariate_groups = Imputation._partition_by_method(config, target_columns)

        for column_name, imputer_type in univariate.items():
            imputer, imputed_values = Imputation._fit_univariate(result, column_name, imputer_type)
            fitted_imputers[column_name] = imputer
            result = result.with_columns(pl.Series(name=column_name, values=imputed_values))

        for imputer_type, columns in multivariate_groups.items():
            context_columns = config.numerical_columns()
            imputer, imputed_context = Imputation._fit_multivariate(result, context_columns, imputer_type)

            for column_name in columns:
                fitted_imputers[column_name] = imputer
                col_index = context_columns.index(column_name)
                result = result.with_columns(
                    pl.Series(name=column_name, values=imputed_context[:, col_index])
                )

        return result, fitted_imputers

    @staticmethod
    def transform(data: pl.DataFrame, config: DataConfig, fitted_imputers: FittedImputers) -> pl.DataFrame:
        """Apply already-fitted imputers to a (possibly different) dataframe.

        :raises ConfigError: if a required fitted imputer is missing, or
            an imputed column is absent from `data`.
        """
        target_columns = Imputation._impute_columns(config)
        missing_imputers = set(target_columns) - set(fitted_imputers.keys())
        if missing_imputers:
            raise ConfigError(
                f"No fitted imputer available for column(s): {sorted(missing_imputers)}"
            )
        Imputation._check_present(data, target_columns)

        univariate, multivariate_groups = Imputation._partition_by_method(config, target_columns)
        result = data

        for column_name in univariate:
            imputer = fitted_imputers[column_name]
            values = result[column_name].to_numpy().reshape(-1, 1)
            imputed = imputer.transform(values).reshape(-1)
            result = result.with_columns(pl.Series(name=column_name, values=imputed))

        for imputer_type, columns in multivariate_groups.items():
            context_columns = config.numerical_columns()
            Imputation._check_present(result, context_columns)
            imputer = fitted_imputers[columns[0]]
            context_values = result.select(context_columns).to_numpy()
            imputed_context = imputer.transform(context_values)

            for column_name in columns:
                col_index = context_columns.index(column_name)
                result = result.with_columns(
                    pl.Series(name=column_name, values=imputed_context[:, col_index])
                )

        return result

    # ------------------------------------------------------------------ #
    # Internals
    # ------------------------------------------------------------------ #
    @staticmethod
    def _impute_columns(config: DataConfig) -> list[str]:
        return [
            name
            for name, info in config.active_columns().items()
            if info.missing_data_management.strategy == MissingStrategy.IMPUTE
        ]

    @staticmethod
    def _check_present(data: pl.DataFrame, columns: list[str]) -> None:
        missing = [c for c in columns if c not in data.columns]
        if missing:
            raise ConfigError(f"Imputed columns missing from dataset: {missing}")

    @staticmethod
    def _check_numeric_compatibility(data: pl.DataFrame, config: DataConfig, columns: list[str]) -> None:
        offending = [
            name
            for name in columns
            if config[name].missing_data_management.imputer in _NUMERIC_ONLY_METHODS
            and not data[name].dtype.is_numeric()
        ]
        if offending:
            raise ConfigError(
                f"Imputer requires numeric column(s), got non-numeric: {offending}. "
                "Use 'most_frequent' for categorical columns."
            )

    @staticmethod
    def _partition_by_method(
        config: DataConfig, columns: list[str]
    ) -> tuple[dict[str, ImputerType], dict[ImputerType, list[str]]]:
        univariate: dict[str, ImputerType] = {}
        multivariate_groups: dict[ImputerType, list[str]] = defaultdict(list)

        for name in columns:
            imputer_type = config[name].missing_data_management.imputer
            if imputer_type in (ImputerType.KNN, ImputerType.ITERATIVE):
                multivariate_groups[imputer_type].append(name)
            else:
                univariate[name] = imputer_type

        return univariate, dict(multivariate_groups)

    @staticmethod
    def _fit_univariate(
        data: pl.DataFrame, column_name: str, imputer_type: ImputerType
    ) -> tuple[SimpleImputer, np.ndarray]:
        strategy = _UNIVARIATE_STRATEGIES[imputer_type]
        fill_value = 0 if imputer_type == ImputerType.ZERO else None

        imputer = SimpleImputer(strategy=strategy, fill_value=fill_value)
        values = data[column_name].to_numpy().reshape(-1, 1)
        imputed = imputer.fit_transform(values).reshape(-1)
        return imputer, imputed

    @staticmethod
    def _fit_multivariate(
        data: pl.DataFrame, context_columns: list[str], imputer_type: ImputerType
    ) -> tuple[KNNImputer | IterativeImputer, np.ndarray]:
        Imputation._check_present(data, context_columns)

        imputer: KNNImputer | IterativeImputer
        if imputer_type == ImputerType.KNN:
            imputer = KNNImputer(n_neighbors=2)
        else:
            imputer = IterativeImputer(random_state=0)

        context_values = data.select(context_columns).to_numpy()
        imputed_context = imputer.fit_transform(context_values)
        return imputer, imputed_context
