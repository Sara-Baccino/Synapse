"""
synapse_matching.algorithms.optimal_transport_assignment
-------------------------------------------------------------------

Partial Wasserstein optimal transport assignment, migrated from the
legacy multivariate_distribution_matching_ot. Unlike greedy_nn/
optimal_hungarian (which produce a 1:1 or 1:K pairwise assignment),
this strategy SELECTS a subset of the pool population of a given target
size, weighting selection by transport mass received -- appropriate for
"reduce a large pool to a distributionally comparable subset" rather
than "pair each query unit with a specific pool unit". MatchingOutput's
optional `selection_mass` field is populated only by this strategy.
"""

from __future__ import annotations
import numpy as np
import ot
from pydantic import BaseModel, ConfigDict, Field

from synapse_matching.algorithms.base import MatchingAlgorithm, MatchingOutput
from synapse_matching.exceptions import MatchingError

__all__ = ["OptimalTransportConfig", "OptimalTransportAssignment"]


class OptimalTransportConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    target_size: int = Field(gt=0)
    nb_dummies: int = Field(default=10, ge=0)
    max_iterations: int = Field(default=1_000_000, gt=0)


class OptimalTransportAssignment(MatchingAlgorithm):
    def __init__(self) -> None:
        super().__init__()
        self._cost_matrix: np.ndarray | None = None
        self._config: OptimalTransportConfig | None = None

    def fit(self, query_X: np.ndarray, pool_X: np.ndarray, config: OptimalTransportConfig) -> "OptimalTransportAssignment":
        from scipy.spatial.distance import cdist
        self._cost_matrix = cdist(query_X, pool_X, metric="euclidean")
        self._config = config
        return self

    def fit_with_distance_matrix(self, distance_matrix: np.ndarray, config: OptimalTransportConfig) -> "OptimalTransportAssignment":
        self._cost_matrix = distance_matrix
        self._config = config
        return self

    def match(self) -> MatchingOutput:
        cost_matrix = self._cost_matrix
        n_query, n_pool = cost_matrix.shape
        target_size = self._config.target_size

        if target_size > n_pool:
            raise MatchingError(
                f"OptimalTransportAssignment target_size ({target_size}) cannot exceed "
                f"the pool size ({n_pool})."
            )

        max_cost = np.max(cost_matrix)
        normalized_cost = cost_matrix / max_cost if max_cost > 0 else cost_matrix

        a = np.ones(n_query, dtype=np.float64) / n_query
        b = np.ones(n_pool, dtype=np.float64) / target_size

        # m must satisfy m <= min(a.sum(), b.sum()). Floating-point
        # summation of many small terms can land a hair below the exact
        # theoretical value (e.g. 0.9999999999999999 instead of 1.0),
        # which POT's internal feasibility check rejects at m=1.0 exactly.
        _EPSILON = 1e-10
        m = max(0.0, min(1.0, float(a.sum()), float(b.sum())) - _EPSILON)

        transport_plan = ot.partial.partial_wasserstein(
            a=a, b=b, M=normalized_cost, m=m,
            nb_dummies=self._config.nb_dummies, numItermax=self._config.max_iterations,
        )

        pool_mass = transport_plan.sum(axis=0)
        min_dist_to_query = cost_matrix.min(axis=0)
        selected_pool_indices = np.lexsort((min_dist_to_query, -pool_mass))[:target_size]

        # OT selects a SUBSET of the pool population; it does not produce
        # a 1:1 pairing (the transport plan distributes mass from many
        # query units to each selected pool unit, so no single query can
        # be honestly declared "the" match). pair_id is therefore -1 for
        # every selected unit, and "query" indices are the full query
        # population rather than a per-pool-unit pairing -- fabricating
        # a pairing via nearest-neighbor post-processing was considered
        # and rejected (see architecture discussion): it would silently
        # misrepresent what the transport plan actually computed.
        pair_id = np.full(target_size, -1, dtype=int)

        self._result = MatchingOutput(
            matched_indices={
                "query": np.arange(n_query, dtype=int),
                "pool": selected_pool_indices.astype(int),
            },
            pair_id=pair_id,
            weights=pool_mass[selected_pool_indices],
            unmatched_units={"query": np.array([], dtype=int)},
            distances=min_dist_to_query[selected_pool_indices],
            strategy_metadata={
                "algorithm": "optimal_transport_sinkhorn",
                "target_size": target_size,
                "n_query": n_query,
                "n_pool": n_pool,
                "transport_mass": m,
                "output_type": "population_selection",
            },
            selection_mass=pool_mass[selected_pool_indices],
        )
        return self._result