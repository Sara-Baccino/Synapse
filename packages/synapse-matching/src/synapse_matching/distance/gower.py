"""
synapse_matching.distance.gower
--------------------------------------

Gower's (1971) general similarity coefficient, generalized to mixed
continuous/categorical covariates: continuous variables use range-
normalized absolute difference, categorical variables use a 0/1
mismatch indicator. The final distance per pair is the unweighted mean
of per-variable partial distances -- distinct from WeightedMixedDistance,
which lets the caller assign explicit weights to the numeric vs
categorical blocks instead of averaging uniformly.
"""

from __future__ import annotations
from typing import Literal
import numpy as np

from synapse_matching.distance.base import DistanceMetric
from synapse_matching.exceptions import MatchingError

__all__ = ["GowerDistance"]


class GowerDistance(DistanceMetric):
    def compute(
        self, X_treated: np.ndarray, X_control: np.ndarray, column_names: list[str],
        column_types: dict[str, Literal["numerical", "categorical"]],
    ) -> np.ndarray:
        if len(column_names) != X_treated.shape[1]:
            raise MatchingError(
                f"GowerDistance received {X_treated.shape[1]} columns but "
                f"{len(column_names)} column_names were provided."
            )

        n_t, n_c = X_treated.shape[0], X_control.shape[0]
        # Input arrays may have dtype=object when the caller selected a
        # mix of numeric/categorical columns (common when built via
        # Polars .to_numpy() on mixed-type frames) -- never trust the
        # implicit array dtype, always cast per-column explicitly below.
        partial_distances = np.zeros((n_t, n_c), dtype=np.float64)

        for col_idx, name in enumerate(column_names):
            col_type = column_types.get(name)
            if col_type is None:
                raise MatchingError(f"GowerDistance: no type declared for column '{name}'.")

            if col_type == "numerical":
                treated_col = X_treated[:, col_idx].astype(np.float64)
                control_col = X_control[:, col_idx].astype(np.float64)
                combined_col = np.concatenate([treated_col, control_col])
                col_range = float(np.ptp(combined_col))

                if col_range == 0:
                    partial = np.zeros((n_t, n_c), dtype=np.float64)
                else:
                    diff = np.abs(treated_col[:, None] - control_col[None, :])
                    partial = (diff / col_range).astype(np.float64)
            else:
                treated_col = X_treated[:, col_idx].astype(str)
                control_col = X_control[:, col_idx].astype(str)
                partial = (treated_col[:, None] != control_col[None, :]).astype(np.float64)

            partial_distances += partial

        return partial_distances / len(column_names)