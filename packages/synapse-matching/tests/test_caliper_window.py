"""
Tests for CaliperWindowFilter and its integration with the algorithms'
own hard-reject threshold (CALIPER_WINDOW_PENALTY), independent of
whether a global scalar caliper is configured.
"""

import numpy as np
import polars as pl
import pytest

from synapse_matching.algorithms.greedy_nearest_neighbor import GreedyNearestNeighborMatching, NearestNeighborConfig
from synapse_matching.algorithms.optimal_assignment import OptimalAssignmentConfig, OptimalAssignmentMatching
from synapse_matching.config.constraints_config import CaliperWindowSpec
from synapse_matching.constraints.caliper_window import CALIPER_WINDOW_PENALTY, CaliperWindowFilter


class TestCaliperWindowFilterMask:
    def test_absolute_scale_numeric_window(self):
        query_df = pl.DataFrame({"age": [30, 50]})
        pool_df = pl.DataFrame({"age": [32, 60, 29]})
        spec = CaliperWindowSpec(covariate="age", caliper_value=5, scale="absolute")

        mask = CaliperWindowFilter().compute_mask(query_df, pool_df, [spec], categorical_columns=set())

        # query[0]=30: |30-32|=2 (ok), |30-60|=30 (no), |30-29|=1 (ok)
        # query[1]=50: |50-32|=18 (no), |50-60|=10 (no), |50-29|=21 (no)
        assert mask.tolist() == [[True, False, True], [False, False, False]]

    def test_standard_deviation_scale(self):
        query_df = pl.DataFrame({"x": [0.0]})
        pool_df = pl.DataFrame({"x": [100.0]})
        # pooled std of [0, 100] is 50; caliper_value=1 std -> threshold=50,
        # diff=100 > 50 -> masked out.
        spec = CaliperWindowSpec(covariate="x", caliper_value=1.0, scale="standard_deviation")
        mask = CaliperWindowFilter().compute_mask(query_df, pool_df, [spec], categorical_columns=set())
        assert mask[0, 0] == False  # noqa: E712

    def test_categorical_covariate_requires_exact_equality(self):
        query_df = pl.DataFrame({"region": ["north"]})
        pool_df = pl.DataFrame({"region": ["north", "south"]})
        # caliper_value is required by the schema (>0) but must be
        # ignored for a categorical covariate: only exact equality counts.
        spec = CaliperWindowSpec(covariate="region", caliper_value=999, scale="absolute")
        mask = CaliperWindowFilter().compute_mask(query_df, pool_df, [spec], categorical_columns={"region"})
        assert mask.tolist() == [[True, False]]

    def test_multiple_specs_are_combined_with_and(self):
        query_df = pl.DataFrame({"age": [30], "region": ["north"]})
        pool_df = pl.DataFrame({"age": [31], "region": ["south"]})
        specs = [
            CaliperWindowSpec(covariate="age", caliper_value=5, scale="absolute"),  # satisfied
            CaliperWindowSpec(covariate="region", caliper_value=1, scale="absolute"),  # violated
        ]
        mask = CaliperWindowFilter().compute_mask(query_df, pool_df, specs, categorical_columns={"region"})
        assert mask[0, 0] == False  # noqa: E712

    def test_no_specs_returns_untouched_matrix(self):
        distance_matrix = np.array([[1.0, 2.0], [3.0, 4.0]])
        result = CaliperWindowFilter().apply_to_distance_matrix(
            distance_matrix, pl.DataFrame({"age": [1, 2]}), pl.DataFrame({"age": [1, 2]}), [], set()
        )
        assert np.array_equal(result, distance_matrix)

    def test_apply_to_distance_matrix_penalizes_masked_pairs(self):
        query_df = pl.DataFrame({"age": [30]})
        pool_df = pl.DataFrame({"age": [30, 80]})
        distance_matrix = np.array([[1.0, 0.5]])  # pool[1] is closer in distance, but violates the window
        spec = CaliperWindowSpec(covariate="age", caliper_value=5, scale="absolute")

        result = CaliperWindowFilter().apply_to_distance_matrix(distance_matrix, query_df, pool_df, [spec], set())

        assert result[0, 0] == 1.0
        assert result[0, 1] == CALIPER_WINDOW_PENALTY


class TestAlgorithmsRejectCaliperWindowPenaltyRegardlessOfScalarCaliper:
    def test_greedy_nn_rejects_penalized_pair_without_scalar_caliper(self):
        # No global caliper configured -- only the hard window penalty.
        distance_matrix = np.array([[CALIPER_WINDOW_PENALTY, 5.0]])
        algorithm = GreedyNearestNeighborMatching().fit_with_distance_matrix(
            distance_matrix, NearestNeighborConfig(caliper=None)
        )
        result = algorithm.match()
        assert result.matched_indices["pool"].tolist() == [1]

    def test_greedy_nn_leaves_query_unmatched_if_all_candidates_penalized(self):
        distance_matrix = np.array([[CALIPER_WINDOW_PENALTY, CALIPER_WINDOW_PENALTY]])
        algorithm = GreedyNearestNeighborMatching().fit_with_distance_matrix(
            distance_matrix, NearestNeighborConfig(caliper=None)
        )
        result = algorithm.match()
        assert result.matched_indices["query"].size == 0
        assert result.unmatched_units["query"].tolist() == [0]

    def test_optimal_assignment_avoids_penalized_pair_when_a_better_alternative_exists(self):
        distance_matrix = np.array([
            [CALIPER_WINDOW_PENALTY, 5.0],
            [3.0, CALIPER_WINDOW_PENALTY],
        ])
        algorithm = OptimalAssignmentMatching().fit_with_distance_matrix(
            distance_matrix, OptimalAssignmentConfig(caliper=None)
        )
        result = algorithm.match()
        pairs = set(zip(result.matched_indices["query"].tolist(), result.matched_indices["pool"].tolist()))
        assert pairs == {(0, 1), (1, 0)}

    def test_optimal_assignment_leaves_query_unmatched_when_only_option_is_penalized(self):
        # 1x1 matrix: Hungarian has no alternative but to "assign" the
        # single pair -- the old code (filtering only when a scalar
        # caliper was configured) would have silently accepted this as a
        # valid match at an effectively infinite distance.
        distance_matrix = np.array([[CALIPER_WINDOW_PENALTY]])
        algorithm = OptimalAssignmentMatching().fit_with_distance_matrix(
            distance_matrix, OptimalAssignmentConfig(caliper=None)
        )
        result = algorithm.match()
        assert result.matched_indices["query"].size == 0
        assert result.unmatched_units["query"].tolist() == [0]