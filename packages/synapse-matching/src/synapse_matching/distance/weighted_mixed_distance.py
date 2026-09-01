"""
synapse_matching.distance.weighted_mixed_distance
------------------------------------------------------------

Migrated from the legacy multivariate_distribution_matching_ot's cost-
matrix computation: range-normalized Manhattan (L1) distance on numeric
columns, Hamming distance (via ordinal encoding) on categorical columns,
combined with explicit user-supplied weights. Distinct from
GowerDistance, which averages per-variable partial distances uniformly
instead of weighting the numeric/categorical blocks separately.
"""

from __future__ import annotations
from typing import Literal
import numpy as np
from scipy.spatial.distance import cdist
from sklearn.preprocessing import OrdinalEncoder

from synapse_matching.distance.base import DistanceMetric
from synapse_matching.exceptions import MatchingError

__all__ = ["WeightedMixedDistance"]


class WeightedMixedDistance(DistanceMetric):
    def __init__(self, weight_numerical: float = 0.6, weight_categorical: float = 0.4) -> None:
        if weight_numerical < 0 or weight_categorical < 0:
            raise MatchingError("WeightedMixedDistance weights must be non-negative.")
        self._weight_numerical = weight_numerical
        self._weight_categorical = weight_categorical

    def compute(
        self, X_treated: np.ndarray, X_control: np.ndarray, column_names: list[str],
        column_types: dict[str, Literal["numerical", "categorical"]],
    ) -> np.ndarray:
        numerical_idx = [i for i, name in enumerate(column_names) if column_types.get(name) == "numerical"]
        categorical_idx = [i for i, name in enumerate(column_names) if column_types.get(name) == "categorical"]

        n_t, n_c = X_treated.shape[0], X_control.shape[0]

        if numerical_idx:
            num_treated = X_treated[:, numerical_idx].astype(np.float32)
            num_control = X_control[:, numerical_idx].astype(np.float32)
            combined_num = np.vstack([num_treated, num_control])
            ranges = np.ptp(combined_num, axis=0)
            ranges[ranges == 0] = 1.0
            D_num = cdist(num_treated / ranges, num_control / ranges, metric="cityblock") / len(numerical_idx)
        else:
            D_num = np.zeros((n_t, n_c), dtype=np.float32)

        if categorical_idx:
            cat_treated = X_treated[:, categorical_idx].astype(str)
            cat_control = X_control[:, categorical_idx].astype(str)
            encoder = OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1)
            encoder.fit(np.vstack([cat_treated, cat_control]))
            enc_treated = encoder.transform(cat_treated).astype(np.int32)
            enc_control = encoder.transform(cat_control).astype(np.int32)
            D_cat = cdist(enc_treated, enc_control, metric="hamming").astype(np.float32)
        else:
            D_cat = np.zeros((n_t, n_c), dtype=np.float32)

        return self._weight_numerical * D_num + self._weight_categorical * D_cat