"""
Tests for PopulationProfiler: routing rule (continuous -> KDE,
categorical/low-cardinality -> per-value frequencies), missingness, and
the split numerical (Pearson) / categorical (Cramér's V) correlation
matrices.
"""

import polars as pl

from synapse_matching.exploration.population_profile import PopulationProfiler


def _profile(df: pl.DataFrame, covariates: list[str]):
    return PopulationProfiler().compute(df, "treatment", covariates)


class TestDistributionRouting:
    def test_continuous_numeric_variable_gets_kde_not_frequencies(self):
        # 20 distinct values -- well above the cardinality threshold.
        df = pl.DataFrame({
            "treatment": [1] * 10 + [0] * 10,
            "age": list(range(20, 40)),
        })
        profile = _profile(df, ["age"])
        assert len(profile.numeric_distributions) == 1
        assert profile.numeric_distributions[0].variable == "age"
        assert len(profile.categorical_frequencies) == 0

    def test_low_cardinality_numeric_gets_frequencies_not_kde(self):
        # Only 3 distinct values (0/1/2) despite being an int column.
        df = pl.DataFrame({
            "treatment": [1] * 10 + [0] * 10,
            "severity": ([0, 1, 2] * 7)[:20],
        })
        profile = _profile(df, ["severity"])
        assert len(profile.categorical_frequencies) == 1
        assert profile.categorical_frequencies[0].variable == "severity"
        assert len(profile.numeric_distributions) == 0

    def test_string_categorical_gets_frequencies_regardless_of_cardinality(self):
        df = pl.DataFrame({
            "treatment": [1] * 10 + [0] * 10,
            "region": (["north", "south", "east", "west"] * 5),
        })
        profile = _profile(df, ["region"])
        assert len(profile.categorical_frequencies) == 1
        assert set(profile.categorical_frequencies[0].categories) == {"north", "south", "east", "west"}

    def test_constant_variable_routes_to_frequencies_not_kde(self):
        # Only 1 distinct value: below the cardinality threshold regardless
        # of dtype, so it goes through the frequency path, not KDE.
        df = pl.DataFrame({
            "treatment": [1] * 10 + [0] * 10,
            "constant": [42] * 20,
        })
        profile = _profile(df, ["constant"])
        assert profile.numeric_distributions == []
        assert len(profile.categorical_frequencies) == 1
        assert profile.categorical_frequencies[0].categories == ["42"]

    def test_compute_kde_returns_none_for_zero_variance_input(self):
        # Direct unit check of the defensive branch itself: unreachable
        # through compute() (>=7 distinct values already implies
        # non-constant), but still real code worth covering directly.
        profiler = PopulationProfiler()
        result = profiler._compute_kde("x", pl.Series([5, 5, 5]), pl.Series([5, 5, 5]))
        assert result is None


class TestMissingness:
    def test_missing_pct_computed_per_group(self):
        df = pl.DataFrame({
            "treatment": [1, 1, 1, 1, 0, 0, 0, 0],
            "age": [20, None, 30, 40, 50, None, None, 60],
        })
        profile = _profile(df, ["age"])
        row = next(r for r in profile.missingness if r.variable == "age")
        assert row.treated_missing_pct == 0.25  # 1 of 4
        assert row.control_missing_pct == 0.5  # 2 of 4


class TestCorrelationSplit:
    def test_numerical_correlations_only_include_continuous_variables(self):
        df = pl.DataFrame({
            "treatment": [1] * 10 + [0] * 10,
            "age": list(range(20, 40)),
            "score": [x * 1.5 for x in range(20)],
            "severity": ([0, 1] * 10),
        })
        profile = _profile(df, ["age", "score", "severity"])
        assert set(profile.numerical_correlations.variables) == {"age", "score"}
        assert "severity" not in profile.numerical_correlations.variables

    def test_categorical_correlations_only_include_categorical_and_low_cardinality(self):
        df = pl.DataFrame({
            "treatment": [1] * 10 + [0] * 10,
            "age": list(range(20, 40)),
            "region": (["north", "south"] * 10),
            "severity": ([0, 1] * 10),
        })
        profile = _profile(df, ["age", "region", "severity"])
        assert set(profile.categorical_correlations.variables) == {"region", "severity"}
        assert "age" not in profile.categorical_correlations.variables

    def test_cramers_v_is_bounded_between_0_and_1(self):
        df = pl.DataFrame({
            "treatment": [1] * 10 + [0] * 10,
            "region": (["north", "south"] * 10),
            "severity": ([0, 1] * 10),
        })
        profile = _profile(df, ["region", "severity"])
        for row in profile.categorical_correlations.treated_matrix + profile.categorical_correlations.control_matrix:
            for value in row:
                assert 0.0 <= value <= 1.0 + 1e-9

    def test_fewer_than_two_variables_returns_empty_matrix_not_crash(self):
        # 10 distinct ages -> genuinely continuous (>= 7 distinct values),
        # but it's the ONLY continuous covariate, so there is nothing to
        # correlate it with: variables are reported, matrices are empty.
        df = pl.DataFrame({
            "treatment": [1] * 5 + [0] * 5,
            "age": list(range(20, 30)),
        })
        profile = _profile(df, ["age"])
        assert profile.numerical_correlations.variables == ["age"]
        assert profile.numerical_correlations.treated_matrix == []
        assert profile.numerical_correlations.control_matrix == []
        assert profile.categorical_correlations.variables == []

    def test_low_cardinality_numeric_is_not_treated_as_continuous_even_with_few_rows(self):
        # Regression guard for the case that caught the test above: a
        # numeric column with only 2 distinct values is discrete by the
        # routing rule (< 7 distinct values), so it must NOT show up
        # among the continuous/Pearson variables.
        df = pl.DataFrame({"treatment": [1, 0], "age": [20, 30]})
        profile = _profile(df, ["age"])
        assert profile.numerical_correlations.variables == []
        assert profile.categorical_correlations.variables == ["age"]