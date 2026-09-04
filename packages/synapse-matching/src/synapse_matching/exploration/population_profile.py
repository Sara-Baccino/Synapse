"""
synapse_matching.exploration.population_profile
------------------------------------------------------

Computes a PopulationProfile for treated vs control groups, before any
matching is configured: descriptive stats, binned distributions for
numeric covariates, frequencies for categorical covariates, missingness
comparison, and per-group correlation matrices. Pure computation, no
side effects, no persistence -- the caller (matching router) decides
what to do with the result.
"""

from __future__ import annotations

import numpy as np
import polars as pl

from synapse_matching.exploration.base import (
    CategoricalFrequency, CorrelationMatrix, DescriptiveStatRow,
    MissingnessRow, NumericDistribution, PopulationProfile,
)

__all__ = ["PopulationProfiler"]

_DEFAULT_N_BINS = 6


class PopulationProfiler:
    def compute(self, df: pl.DataFrame, treatment_column: str, covariates: list[str], n_bins: int = _DEFAULT_N_BINS) -> PopulationProfile:
        treated = df.filter(pl.col(treatment_column) == 1)
        control = df.filter(pl.col(treatment_column) == 0)

        descriptive_stats: list[DescriptiveStatRow] = []
        numeric_distributions: list[NumericDistribution] = []
        categorical_frequencies: list[CategoricalFrequency] = []
        missingness: list[MissingnessRow] = []

        numeric_covariates: list[str] = []

        for var in covariates:
            is_numeric = df.schema[var].is_numeric()
            t_col, c_col = treated[var], control[var]

            missingness.append(MissingnessRow(
                variable=var,
                treated_missing_pct=t_col.null_count() / max(treated.height, 1),
                control_missing_pct=c_col.null_count() / max(control.height, 1),
            ))

            if is_numeric:
                numeric_covariates.append(var)
                for group_name, col in (("treated", t_col), ("control", c_col)):
                    clean = col.drop_nulls()
                    descriptive_stats.append(DescriptiveStatRow(
                        variable=var, group=group_name,
                        mean=float(clean.mean()) if clean.len() > 0 else None,
                        std=float(clean.std()) if clean.len() > 1 else None,
                        min=float(clean.min()) if clean.len() > 0 else None,
                        max=float(clean.max()) if clean.len() > 0 else None,
                    ))

                t_vals = t_col.drop_nulls().to_numpy()
                c_vals = c_col.drop_nulls().to_numpy()
                if t_vals.size > 0 and c_vals.size > 0:
                    combined = np.concatenate([t_vals, c_vals])
                    if np.ptp(combined) > 0:
                        bin_edges = np.histogram_bin_edges(combined, bins=n_bins)
                        t_counts, _ = np.histogram(t_vals, bins=bin_edges)
                        c_counts, _ = np.histogram(c_vals, bins=bin_edges)
                        numeric_distributions.append(NumericDistribution(
                            variable=var, bin_edges=bin_edges.tolist(),
                            treated_counts=t_counts.tolist(), control_counts=c_counts.tolist(),
                        ))
            else:
                t_vals = t_col.drop_nulls().to_list()
                c_vals = c_col.drop_nulls().to_list()
                categories = sorted(set(t_vals) | set(c_vals), key=str)
                if categories:
                    t_freq = [t_vals.count(cat) / len(t_vals) if t_vals else 0.0 for cat in categories]
                    c_freq = [c_vals.count(cat) / len(c_vals) if c_vals else 0.0 for cat in categories]
                    categorical_frequencies.append(CategoricalFrequency(
                        variable=var, categories=[str(c) for c in categories],
                        treated_frequencies=t_freq, control_frequencies=c_freq,
                    ))

        correlations = self._compute_correlations(treated, control, numeric_covariates)

        return PopulationProfile(
            descriptive_stats=descriptive_stats,
            numeric_distributions=numeric_distributions,
            categorical_frequencies=categorical_frequencies,
            missingness=missingness,
            correlations=correlations,
        )

    def _compute_correlations(self, treated: pl.DataFrame, control: pl.DataFrame, numeric_covariates: list[str]) -> CorrelationMatrix:
        if len(numeric_covariates) < 2:
            return CorrelationMatrix(variables=numeric_covariates, treated_matrix=[], control_matrix=[])

        def corr_matrix(df: pl.DataFrame) -> list[list[float]]:
            sub = df.select(numeric_covariates).drop_nulls()
            if sub.height < 2:
                n = len(numeric_covariates)
                return [[1.0 if i == j else 0.0 for j in range(n)] for i in range(n)]
            arr = sub.to_numpy()
            matrix = np.corrcoef(arr, rowvar=False)
            return np.nan_to_num(matrix, nan=0.0).tolist()

        return CorrelationMatrix(
            variables=numeric_covariates,
            treated_matrix=corr_matrix(treated),
            control_matrix=corr_matrix(control),
        )