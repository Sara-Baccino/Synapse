"""
synapse_core.dataset.transformers
-------------------------------------

Applies per-column EncodingConfig (declared in ColumnInfo) to categorical
columns: deterministic ordinal encoding or one-hot encoding. Mirrors
scaling.py's fit/transform separation: fitted encoders are returned as a
plain artifact dict, never embedded into DataConfig, so a second dataset
(e.g. synthetic data) can be encoded against the exact category set seen
at fit time -- critical for keeping one-hot schemas aligned across
datasets that must be compared.
"""

from __future__ import annotations

import numpy as np
import polars as pl
from sklearn.preprocessing import OneHotEncoder, OrdinalEncoder

from synapse_core.exceptions import ConfigError
from synapse_core.models.column_info import ColumnInfo, EncoderType
from synapse_core.models.data_config import DataConfig

__all__ = ["Transformers", "FittedEncoders"]

FittedEncoder = OrdinalEncoder | OneHotEncoder
FittedEncoders = dict[str, FittedEncoder]
"""Column name -> fitted sklearn encoder. Lives outside DataConfig."""


class Transformers:
    """Stateless utility for fitting/applying per-column categorical encoders."""

    @staticmethod
    def fit_transform(data: pl.DataFrame, config: DataConfig) -> tuple[pl.DataFrame, FittedEncoders]:
        """Fit an encoder per column with encoding enabled, and apply it.

        :param data: preprocessed dataframe (see Preprocessing.run).
        :param config: DataConfig describing which columns to encode and how.
        :return: (encoded dataframe, fitted encoders keyed by original column name).
        :raises ConfigError: if an encoded column is missing from `data`.
        """
        columns_to_encode = Transformers._encoded_columns(config)
        Transformers._check_present(data, columns_to_encode)

        fitted_encoders: FittedEncoders = {}
        result = data

        for column_name in columns_to_encode:
            info = config[column_name]
            values = result[column_name].to_numpy().reshape(-1, 1)

            if info.encoding.method == EncoderType.ORDINAL:
                encoder, encoded = Transformers._fit_ordinal(values, info)
                result = result.with_columns(
                    pl.Series(name=column_name, values=encoded.reshape(-1))
                )
            else:  # ONE_HOT
                encoder, new_columns_df = Transformers._fit_one_hot(values, column_name)
                result = result.drop(column_name).hstack(new_columns_df)

            fitted_encoders[column_name] = encoder

        return result, fitted_encoders

    @staticmethod
    def transform(data: pl.DataFrame, config: DataConfig, fitted_encoders: FittedEncoders) -> pl.DataFrame:
        """Apply already-fitted encoders to a (possibly different) dataframe.

        Guarantees the same resulting schema as fit_transform: one-hot
        columns are created even for categories absent from `data`
        (filled with 0), and unseen categories map to an all-zero row
        (one-hot) or null (ordinal).

        :raises ConfigError: if a required fitted encoder is missing, or
            an encoded column is absent from `data`.
        """
        columns_to_encode = Transformers._encoded_columns(config)
        missing_encoders = set(columns_to_encode) - set(fitted_encoders.keys())
        if missing_encoders:
            raise ConfigError(
                f"No fitted encoder available for column(s): {sorted(missing_encoders)}"
            )
        Transformers._check_present(data, columns_to_encode)

        result = data
        for column_name in columns_to_encode:
            info = config[column_name]
            encoder = fitted_encoders[column_name]
            values = result[column_name].to_numpy().reshape(-1, 1)

            if info.encoding.method == EncoderType.ORDINAL:
                encoded = encoder.transform(values)
                result = result.with_columns(
                    pl.Series(name=column_name, values=encoded.reshape(-1))
                )
            else:  # ONE_HOT
                new_columns_df = Transformers._apply_one_hot(encoder, values, column_name)
                result = result.drop(column_name).hstack(new_columns_df)

        return result

    @staticmethod
    def encoded_column_names(config: DataConfig, fitted_encoders: FittedEncoders, original_column: str) -> list[str]:
        """Return the resulting column name(s) for an originally-encoded column.

        For ordinal encoding this is [original_column] unchanged; for
        one-hot it is the list of expanded '<column>__<category>' names.
        """
        info = config[original_column]
        if info.encoding.method == EncoderType.ORDINAL:
            return [original_column]

        encoder = fitted_encoders[original_column]
        categories = encoder.categories_[0]
        return [f"{original_column}__{category}" for category in categories]

    # ------------------------------------------------------------------ #
    # Internals
    # ------------------------------------------------------------------ #
    @staticmethod
    def _encoded_columns(config: DataConfig) -> list[str]:
        return [name for name, info in config.active_columns().items() if info.encoding.enabled]

    @staticmethod
    def _check_present(data: pl.DataFrame, columns: list[str]) -> None:
        missing = [c for c in columns if c not in data.columns]
        if missing:
            raise ConfigError(f"Encoded columns missing from dataset: {missing}")

    @staticmethod
    def _fit_ordinal(values: np.ndarray, info: ColumnInfo) -> tuple[OrdinalEncoder, np.ndarray]:
        categories = [info.encoding.order] if info.encoding.order is not None else "auto"
        encoder = OrdinalEncoder(
            categories=categories,
            handle_unknown="use_encoded_value",
            unknown_value=np.nan,
            encoded_missing_value=np.nan,
        )
        encoded = encoder.fit_transform(values)
        return encoder, encoded

    @staticmethod
    def _fit_one_hot(values: np.ndarray, column_name: str) -> tuple[OneHotEncoder, pl.DataFrame]:
        encoder = OneHotEncoder(handle_unknown="ignore", sparse_output=False)
        encoded = encoder.fit_transform(values)
        new_columns_df = Transformers._one_hot_to_polars(encoder, encoded, column_name)
        return encoder, new_columns_df

    @staticmethod
    def _apply_one_hot(encoder: OneHotEncoder, values: np.ndarray, column_name: str) -> pl.DataFrame:
        encoded = encoder.transform(values)
        return Transformers._one_hot_to_polars(encoder, encoded, column_name)

    @staticmethod
    def _one_hot_to_polars(encoder: OneHotEncoder, encoded: np.ndarray, column_name: str) -> pl.DataFrame:
        categories = encoder.categories_[0]
        new_names = [f"{column_name}__{category}" for category in categories]
        return pl.DataFrame(encoded, schema=new_names)
