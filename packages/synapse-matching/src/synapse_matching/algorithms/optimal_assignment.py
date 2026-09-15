"""
synapse_matching.algorithms.optimal_assignment
-------------------------------------------------------

Optimal (Hungarian) assignment via scipy.optimize.linear_sum_assignment,
migrated from the legacy match_mahalanobis_ps's assignment block.
Generalized to operate on any precomputed distance matrix (not only the
Mahalanobis+PS combination), so it composes with any DistanceMetric.
"""

from __future__ import annotations
import numpy as np
from pydantic import BaseModel, ConfigDict
from scipy.optimize import linear_sum_assignment

from synapse_matching.algorithms.base import MatchingAlgorithm, MatchingOutput
from synapse_matching.constraints.caliper_window import CALIPER_WINDOW_PENALTY

__all__ = ["OptimalAssignmentConfig", "OptimalAssignmentMatching"]

_PENALTY = CALIPER_WINDOW_PENALTY


class OptimalAssignmentConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    caliper: float | None = None
    """Maximum admissible distance for a pair to be considered valid.
    Pairs exceeding it are penalized in the cost matrix and, if still
    selected by the solver, filtered out afterward -- mirroring the
    legacy's double caliper + post-hoc `valid` mask."""


class OptimalAssignmentMatching(MatchingAlgorithm):
    """Global-cost-minimizing 1:1 assignment. Never used with
    replacement (unique assignment by construction) -- enforced upstream
    by StrategyConfig's own validator, not re-checked here."""

    def __init__(self) -> None:
        super().__init__()
        self._distance_matrix: np.ndarray | None = None
        self._config: OptimalAssignmentConfig | None = None

    def fit(self, query_X: np.ndarray, pool_X: np.ndarray, config: OptimalAssignmentConfig) -> "OptimalAssignmentMatching":
        from scipy.spatial.distance import cdist
        self._distance_matrix = cdist(query_X, pool_X, metric="euclidean")
        self._config = config
        return self

    def fit_with_distance_matrix(self, distance_matrix: np.ndarray, config: OptimalAssignmentConfig) -> "OptimalAssignmentMatching":
        """Alternative entry point for callers (e.g. MatchingModule) that
        already computed the distance matrix via a DistanceMetric
        (Mahalanobis, Gower, etc.) instead of the default Euclidean used
        by fit()."""
        self._distance_matrix = distance_matrix
        self._config = config
        return self

    def match(self) -> MatchingOutput:
        D = self._distance_matrix
        n_query, n_pool = D.shape

        cost_matrix = D.copy()
        if self._config.caliper is not None:
            cost_matrix[D > self._config.caliper] = _PENALTY

        row_ind, col_ind = linear_sum_assignment(cost_matrix)

        selected_distances = D[row_ind, col_ind]
        # Pairs masked out by a hard per-covariate caliper window
        # (ConstraintsConfig.caliper_windows) are always rejected here,
        # independent of whether an overall scalar caliper is configured
        # below -- Hungarian may still have picked one of these as "least
        # bad" if nothing better was available for that row/column.
        valid = selected_distances < _PENALTY
        if self._config.caliper is not None:
            valid &= selected_distances <= self._config.caliper
        row_ind, col_ind = row_ind[valid], col_ind[valid]

        matched_query = set(row_ind.tolist())
        unmatched = np.array([i for i in range(n_query) if i not in matched_query], dtype=int)

        self._result = MatchingOutput(
            matched_indices={"query": row_ind.astype(int), "pool": col_ind.astype(int)},
            pair_id=np.arange(len(row_ind), dtype=int),
            weights=np.ones(len(row_ind), dtype=float),
            unmatched_units={"query": unmatched},
            distances=D[row_ind, col_ind] if len(row_ind) > 0 else np.array([]),
            strategy_metadata={
                "algorithm": "optimal_hungarian",
                "n_matched_pairs": len(row_ind),
                "n_query": n_query,
                "match_rate": len(row_ind) / n_query if n_query else 0.0,
            },
        )
        return self._result