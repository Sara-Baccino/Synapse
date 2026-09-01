from __future__ import annotations
import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from synapse_matching.algorithms.base import MatchingAlgorithm, MatchingOutput

__all__ = ["NearestNeighborConfig", "GreedyNearestNeighborMatching"]


class NearestNeighborConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    caliper: float | None = None
    replacement: bool = False
    ratio_k: int = Field(default=1, ge=1)


class GreedyNearestNeighborMatching(MatchingAlgorithm):
    """Greedy 1:K nearest-neighbor matching on a precomputed distance
    matrix, processing query units in index order (deterministic).
    fit() computes Euclidean distance internally for convenience;
    fit_with_distance_matrix() accepts any precomputed matrix (Mahalanobis,
    Gower, weighted hybrid, ...), so the same greedy logic serves every
    distance metric without duplication."""

    def __init__(self) -> None:
        super().__init__()
        self._distance_matrix: np.ndarray | None = None
        self._config: NearestNeighborConfig | None = None

    def fit(self, query_X: np.ndarray, pool_X: np.ndarray, config: NearestNeighborConfig) -> "GreedyNearestNeighborMatching":
        from scipy.spatial.distance import cdist
        self._distance_matrix = cdist(query_X, pool_X, metric="euclidean")
        self._config = config
        return self

    def fit_with_distance_matrix(self, distance_matrix: np.ndarray, config: NearestNeighborConfig) -> "GreedyNearestNeighborMatching":
        self._distance_matrix = distance_matrix
        self._config = config
        return self

    def match(self) -> MatchingOutput:
        D = self._distance_matrix
        n_query, n_pool = D.shape
        used_pool = np.zeros(n_pool, dtype=bool)

        query_idx, pool_idx, dists, pair_ids, unmatched = [], [], [], [], []
        next_pair_id = 0

        for i in range(n_query):
            available = np.where(~used_pool)[0] if not self._config.replacement else np.arange(n_pool)
            if available.size == 0:
                unmatched.append(i)
                continue

            row = D[i, available]
            order = np.argsort(row)
            taken_this_round = 0

            for local_idx in order:
                if taken_this_round >= self._config.ratio_k:
                    break
                dist = row[local_idx]
                if self._config.caliper is not None and dist > self._config.caliper:
                    continue
                pool_index = available[local_idx]
                query_idx.append(i)
                pool_idx.append(pool_index)
                dists.append(float(dist))
                pair_ids.append(next_pair_id)
                if not self._config.replacement:
                    used_pool[pool_index] = True
                taken_this_round += 1

            if taken_this_round == 0:
                unmatched.append(i)
            next_pair_id += 1

        n_pairs = len(query_idx)
        self._result = MatchingOutput(
            matched_indices={"query": np.array(query_idx, dtype=int), "pool": np.array(pool_idx, dtype=int)},
            pair_id=np.array(pair_ids, dtype=int),
            weights=np.ones(n_pairs, dtype=float),
            unmatched_units={"query": np.array(unmatched, dtype=int)},
            distances=np.array(dists, dtype=float),
            strategy_metadata={
                "algorithm": "greedy_nn",
                "ratio_k": self._config.ratio_k,
                "n_matched_query_units": len(set(query_idx)),
                "n_matched_pairs": n_pairs,
                "n_query": n_query,
                "match_rate": len(set(query_idx)) / n_query if n_query else 0.0,
            },
        )
        return self._result