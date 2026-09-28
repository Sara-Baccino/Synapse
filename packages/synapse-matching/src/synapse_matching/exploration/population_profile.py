"""
synapse_matching.exploration.population_profile
------------------------------------------------------

Computes a PopulationProfile for treated vs control groups, before any
matching is configured: descriptive stats, distributions, missingness
comparison, and per-group correlation matrices. Pure computation, no
side effects, no persistence -- the caller (matching router) decides
what to do with the result.

Routing rule for distributions (not "is this dtype numeric"): a
covariate is treated as continuous (KDE) only if it is numeric AND has
at least _CATEGORICAL_CARDINALITY_THRESHOLD distinct values; every
categorical covariate, and every low-cardinality numeric one (e.g. a
0/1 flag, a 1-5 satisfaction score), gets a per-value frequency bar
instead -- binning a variable that only takes a handful of values would
manufacture bins that don't correspond to anything real.
"""

from __future__ import annotations

import numpy as np
import polars as pl
from scipy.stats import chi2_contingency, gaussian_kde

from synapse_matching.exploration.base import (
    CategoricalFrequency, CorrelationMatrix, DescriptiveStatRow,
    MissingnessRow, NumericDistribution, PopulationProfile,
)

__all__ = ["PopulationProfiler"]

_CATEGORICAL_CARDINALITY_THRESHOLD = 7
_KDE_GRID_POINTS = 200


class PopulationProfiler:
    def compute(self, df: pl.DataFrame, treatment_column: str, covariates: list[str]) -> PopulationProfile:
        treated = df.filter(pl.col(treatment_column) == 1)
        control = df.filter(pl.col(treatment_column) == 0)

        descriptive_stats: list[DescriptiveStatRow] = []
        numeric_distributions: list[NumericDistribution] = []
        categorical_frequencies: list[CategoricalFrequency] = []
        missingness: list[MissingnessRow] = []

        continuous_covariates: list[str] = []
        categorical_like_covariates: list[str] = []

        for var in covariates:
            t_col, c_col = treated[var], control[var]

            missingness.append(MissingnessRow(
                variable=var,
                treated_missing_pct=t_col.null_count() / max(treated.height, 1),
                control_missing_pct=c_col.null_count() / max(control.height, 1),
            ))

            is_numeric = df.schema[var].is_numeric()
            n_distinct = df[var].drop_nulls().n_unique()
            is_continuous = is_numeric and n_distinct >= _CATEGORICAL_CARDINALITY_THRESHOLD

            if is_numeric:
                continuous_covariates.append(var) if is_continuous else categorical_like_covariates.append(var)
                for group_name, col in (("treated", t_col), ("control", c_col)):
                    clean = col.drop_nulls()
                    descriptive_stats.append(DescriptiveStatRow(
                        variable=var, group=group_name,
                        mean=float(clean.mean()) if clean.len() > 0 else None,
                        std=float(clean.std()) if clean.len() > 1 else None,
                        min=float(clean.min()) if clean.len() > 0 else None,
                        max=float(clean.max()) if clean.len() > 0 else None,
                    ))
            else:
                categorical_like_covariates.append(var)

            if is_continuous:
                distribution = self._compute_kde(var, t_col, c_col)
                if distribution is not None:
                    numeric_distributions.append(distribution)
            else:
                frequency = self._compute_frequencies(var, t_col, c_col)
                if frequency is not None:
                    categorical_frequencies.append(frequency)

        numerical_correlations = self._compute_pearson_correlations(treated, control, continuous_covariates)
        categorical_correlations = self._compute_cramers_v_correlations(treated, control, categorical_like_covariates)

        return PopulationProfile(
            descriptive_stats=descriptive_stats,
            numeric_distributions=numeric_distributions,
            categorical_frequencies=categorical_frequencies,
            missingness=missingness,
            numerical_correlations=numerical_correlations,
            categorical_correlations=categorical_correlations,
        )

    def _compute_kde(self, var: str, t_col: pl.Series, c_col: pl.Series) -> NumericDistribution | None:
        t_vals = t_col.drop_nulls().to_numpy().astype(float)
        c_vals = c_col.drop_nulls().to_numpy().astype(float)
        if t_vals.size == 0 and c_vals.size == 0:
            return None

        combined = np.concatenate([t_vals, c_vals])
        if np.ptp(combined) == 0:
            return None  # a constant variable has no density shape to plot

        # A small padding beyond the observed range keeps the KDE curve
        # from looking like it's cut off exactly at the min/max points.
        pad = 0.05 * np.ptp(combined)
        x_grid = np.linspace(combined.min() - pad, combined.max() + pad, _KDE_GRID_POINTS)

        def density(values: np.ndarray) -> list[float]:
            if values.size < 2 or np.ptp(values) == 0:
                return [0.0] * len(x_grid)
            try:
                return gaussian_kde(values)(x_grid).tolist()
            except np.linalg.LinAlgError:
                return [0.0] * len(x_grid)

        return NumericDistribution(
            variable=var, x_grid=x_grid.tolist(),
            treated_density=density(t_vals), control_density=density(c_vals),
        )

    def _compute_frequencies(self, var: str, t_col: pl.Series, c_col: pl.Series) -> CategoricalFrequency | None:
        t_vals = t_col.drop_nulls().to_list()
        c_vals = c_col.drop_nulls().to_list()
        categories = sorted(set(t_vals) | set(c_vals), key=str)
        if not categories:
            return None
        t_freq = [t_vals.count(cat) / len(t_vals) if t_vals else 0.0 for cat in categories]
        c_freq = [c_vals.count(cat) / len(c_vals) if c_vals else 0.0 for cat in categories]
        return CategoricalFrequency(
            variable=var, categories=[str(c) for c in categories],
            treated_frequencies=t_freq, control_frequencies=c_freq,
        )

    def _compute_pearson_correlations(self, treated: pl.DataFrame, control: pl.DataFrame, variables: list[str]) -> CorrelationMatrix:
        if len(variables) < 2:
            return CorrelationMatrix(variables=variables, treated_matrix=[], control_matrix=[])

        def corr_matrix(df: pl.DataFrame) -> list[list[float]]:
            sub = df.select(variables).drop_nulls()
            if sub.height < 2:
                n = len(variables)
                return [[1.0 if i == j else 0.0 for j in range(n)] for i in range(n)]
            matrix = np.corrcoef(sub.to_numpy(), rowvar=False)
            return np.nan_to_num(matrix, nan=0.0).tolist()

        return CorrelationMatrix(variables=variables, treated_matrix=corr_matrix(treated), control_matrix=corr_matrix(control))

    def _compute_cramers_v_correlations(self, treated: pl.DataFrame, control: pl.DataFrame, variables: list[str]) -> CorrelationMatrix:
        if len(variables) < 2:
            return CorrelationMatrix(variables=variables, treated_matrix=[], control_matrix=[])

        def assoc_matrix(df: pl.DataFrame) -> list[list[float]]:
            n = len(variables)
            matrix = np.eye(n).tolist()
            for i in range(n):
                for j in range(i + 1, n):
                    sub = df.select([variables[i], variables[j]]).drop_nulls()
                    v = _cramers_v(sub[variables[i]].to_list(), sub[variables[j]].to_list()) if sub.height > 0 else 0.0
                    matrix[i][j] = v
                    matrix[j][i] = v
            return matrix

        return CorrelationMatrix(variables=variables, treated_matrix=assoc_matrix(treated), control_matrix=assoc_matrix(control))


def _cramers_v(x_values: list, y_values: list) -> float:
    """Cramér's V association between two categorical variables, in
    [0, 1] (0 = independent, 1 = perfectly associated) -- the categorical
    analogue of a Pearson correlation, since Pearson itself isn't
    meaningful for unordered categories."""
    x_categories = sorted(set(x_values), key=str)
    y_categories = sorted(set(y_values), key=str)
    if len(x_categories) < 2 or len(y_categories) < 2:
        return 0.0

    x_index = {v: i for i, v in enumerate(x_categories)}
    y_index = {v: i for i, v in enumerate(y_categories)}
    table = np.zeros((len(x_categories), len(y_categories)))
    for xv, yv in zip(x_values, y_values):
        table[x_index[xv], y_index[yv]] += 1

    try:
        chi2, _, _, _ = chi2_contingency(table)
    except ValueError:
        return 0.0

    n = table.sum()
    if n == 0:
        return 0.0
    r, k = table.shape
    denom = min(r - 1, k - 1)
    if denom <= 0:
        return 0.0
    return float(np.sqrt((chi2 / n) / denom))