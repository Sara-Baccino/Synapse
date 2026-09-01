"""
synapse_matching.diagnostics.balance.jensen_shannon
--------------------------------------------------------

Jensen-Shannon divergence as a balance metric: for each covariate,
compares the empirical distribution of the treated group against the
control group. Adapted from synclair_structure's
JensenShannonDivergenceMetric (same underlying formula), but exposed
here through the BalanceMetric interface (df, treatment_column,
covariates) instead of two raw arrays, for consistency with SMD/
VarianceRatio/KS/Chi-square in this same layer.

For continuous covariates, the empirical distribution is built via
histogram binning (shared bin edges across both groups) before applying
Jensen-Shannon; for categorical covariates, the distribution is the
normalized value-count over shared categories.
"""

from __future__ import annotations

import numpy as np
import polars as pl
from scipy.spatial.distance import jensenshannon

from synapse_matching.diagnostics.balance.base import BalanceMetric

__all__ = ["JensenShannonBalanceMetric"]

_DEFAULT_N_BINS = 20


class JensenShannonBalanceMetric(BalanceMetric):
    """Jensen-Shannon divergence between treated/control distributions,
    per covariate. Returns a value in [0, 1] (base-2), 0 = identical
    distributions. Applicable to both continuous (histogram-binned) and
    categorical (value-count-based) covariates.
    """

    metric_name = "jensen_shannon"

    def __init__(self, n_bins: int = _DEFAULT_N_BINS) -> None:
        self._n_bins = n_bins

    def compute(self, df: pl.DataFrame, treatment_column: str, covariates: list[str]) -> pl.DataFrame:
        treated = df.filter(pl.col(treatment_column) == 1)
        control = df.filter(pl.col(treatment_column) == 0)

        rows = []
        for var in covariates:
            t_vals = treated[var].drop_nulls()
            c_vals = control[var].drop_nulls()

            if t_vals.len() == 0 or c_vals.len() == 0:
                rows.append({"variable": var, "jensen_shannon": None})
                continue

            if df.schema[var].is_numeric():
                p, q = self._to_histogram_distributions(t_vals.to_numpy(), c_vals.to_numpy())
            else:
                p, q = self._to_categorical_distributions(t_vals.to_list(), c_vals.to_list())

            if p is None or q is None:
                rows.append({"variable": var, "jensen_shannon": None})
                continue

            js_distance = jensenshannon(p, q, base=2.0)
            js_divergence = float(js_distance**2) if not np.isnan(js_distance) else None
            rows.append({"variable": var, "jensen_shannon": js_divergence})

        return pl.DataFrame(rows)

    def _to_histogram_distributions(
        self, t_vals: np.ndarray, c_vals: np.ndarray
    ) -> tuple[np.ndarray | None, np.ndarray | None]:
        combined = np.concatenate([t_vals, c_vals])
        if np.ptp(combined) == 0:
            return None, None

        bin_edges = np.histogram_bin_edges(combined, bins=self._n_bins)
        p_counts, _ = np.histogram(t_vals, bins=bin_edges)
        q_counts, _ = np.histogram(c_vals, bins=bin_edges)

        p_sum, q_sum = p_counts.sum(), q_counts.sum()
        if p_sum == 0 or q_sum == 0:
            return None, None

        return p_counts / p_sum, q_counts / q_sum

    def _to_categorical_distributions(
        self, t_vals: list, c_vals: list
    ) -> tuple[np.ndarray | None, np.ndarray | None]:
        categories = sorted(set(t_vals) | set(c_vals), key=str)
        if not categories:
            return None, None

        t_counts = np.array([t_vals.count(cat) for cat in categories], dtype=float)
        c_counts = np.array([c_vals.count(cat) for cat in categories], dtype=float)

        t_sum, c_sum = t_counts.sum(), c_counts.sum()
        if t_sum == 0 or c_sum == 0:
            return None, None

        return t_counts / t_sum, c_counts / c_sum