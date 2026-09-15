"""
synapse_matching.constraints.caliper_window
------------------------------------------------

CaliperWindowFilter enforces per-covariate hard tolerance windows on a
(query, pool) distance matrix -- a (query_i, pool_j) pair is masked out
if it violates the window on ANY configured covariate. Unlike
ExactMatchingConstraint/PopulationConstraint (which partition the
population into discrete strata), this operates pairwise: a continuous
tolerance window (e.g. "age within 5 years") cannot be represented as a
partition, only as a per-pair validity check.

Masked-out pairs are set to the same large-but-finite penalty already
used by the global caliper (algorithms/optimal_assignment.py's
_PENALTY), not np.inf: scipy's linear_sum_assignment can raise on a
truly infeasible (all-inf) cost matrix, while a large finite value lets
it still return an assignment when nothing better is available, which
greedy_nearest_neighbor's own hard-reject threshold then discards.
"""

from __future__ import annotations

import numpy as np
import polars as pl

from synapse_matching.config.constraints_config import CaliperWindowSpec

__all__ = ["CALIPER_WINDOW_PENALTY", "CaliperWindowFilter"]

CALIPER_WINDOW_PENALTY = 1e10


class CaliperWindowFilter:
    def compute_mask(
        self,
        query_df: pl.DataFrame,
        pool_df: pl.DataFrame,
        specs: list[CaliperWindowSpec],
        categorical_columns: set[str],
    ) -> np.ndarray:
        """Returns a boolean (n_query, n_pool) matrix: True where the pair
        satisfies every configured caliper window."""
        n_query, n_pool = query_df.height, pool_df.height
        mask = np.ones((n_query, n_pool), dtype=bool)

        for spec in specs:
            query_values = query_df[spec.covariate].to_numpy()
            pool_values = pool_df[spec.covariate].to_numpy()

            if spec.covariate in categorical_columns:
                # No numeric distance for a category: the "window" is
                # exact equality, regardless of caliper_value/scale.
                pair_valid = query_values[:, None] == pool_values[None, :]
            else:
                diff = np.abs(query_values[:, None].astype(float) - pool_values[None, :].astype(float))
                threshold = spec.caliper_value
                if spec.scale == "standard_deviation":
                    pooled_std = np.concatenate([query_values, pool_values]).astype(float).std()
                    threshold = spec.caliper_value * pooled_std if pooled_std > 0 else 0.0
                pair_valid = diff <= threshold

            mask &= pair_valid

        return mask

    def apply_to_distance_matrix(
        self,
        distance_matrix: np.ndarray,
        query_df: pl.DataFrame,
        pool_df: pl.DataFrame,
        specs: list[CaliperWindowSpec],
        categorical_columns: set[str],
    ) -> np.ndarray:
        if not specs:
            return distance_matrix
        mask = self.compute_mask(query_df, pool_df, specs, categorical_columns)
        masked = distance_matrix.copy()
        masked[~mask] = CALIPER_WINDOW_PENALTY
        return masked