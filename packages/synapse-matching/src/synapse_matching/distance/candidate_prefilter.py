"""
synapse_matching.distance.candidate_prefilter
--------------------------------------------------------

k-NN pre-filtering of the pool population before an expensive
assignment step (Hungarian is O(n^3), Optimal Transport solves a
transport problem over the full cost matrix). Migrated from the legacy
multivariate_distribution_matching_ot's k-NN pre-selection block,
including its dynamic widening fallback when too few unique candidates
are found.
"""

from __future__ import annotations
import numpy as np
from pydantic import BaseModel, ConfigDict, Field

__all__ = ["CandidatePreFilterConfig", "KNearestNeighborCandidatePreFilter"]


class CandidatePreFilterConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    k_neighbors: int = Field(default=7, ge=1)
    min_candidates: int | None = None
    widened_k_neighbors: int = Field(default=15, ge=1)


class KNearestNeighborCandidatePreFilter:
    """Reduces a large pool to a smaller set of candidate indices, using
    the k nearest pool units (by cost) for each query unit. If the
    resulting unique candidate set is smaller than min_candidates, widens
    k once (matching the legacy's dynamic widening behaviour) before
    giving up and returning whatever was found.
    """

    def apply(self, cost_matrix: np.ndarray, config: CandidatePreFilterConfig) -> np.ndarray:
        n_query, n_pool = cost_matrix.shape
        k = min(config.k_neighbors, n_pool)

        knn_indices = np.argpartition(cost_matrix, kth=k - 1, axis=1)[:, :k]
        candidate_indices = np.unique(knn_indices.flatten())

        if config.min_candidates is not None and candidate_indices.size < config.min_candidates:
            widened_k = min(config.widened_k_neighbors, n_pool)
            knn_indices = np.argpartition(cost_matrix, kth=widened_k - 1, axis=1)[:, :widened_k]
            candidate_indices = np.unique(knn_indices.flatten())

        return candidate_indices