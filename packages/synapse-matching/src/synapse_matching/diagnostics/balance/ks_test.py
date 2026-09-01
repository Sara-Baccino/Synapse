from __future__ import annotations
import numpy as np
import polars as pl
from scipy.stats import ks_2samp

from synapse_matching.diagnostics.balance.base import BalanceMetric

__all__ = ["KolmogorovSmirnovBalanceTest"]


class KolmogorovSmirnovBalanceTest(BalanceMetric):
    """Two-sample KS test between treated/control distributions, applied
    only to continuous covariates (more than 2 unique combined values,
    same categorical/continuous heuristic used by the legacy code).
    Binary/categorical covariates return null -- use ChiSquareBalanceTest
    for those instead."""

    metric_name = "ks_test"

    def compute(self, df: pl.DataFrame, treatment_column: str, covariates: list[str]) -> pl.DataFrame:
        treated = df.filter(pl.col(treatment_column) == 1)
        control = df.filter(pl.col(treatment_column) == 0)

        rows = []
        for var in covariates:
            t_vals = treated[var].drop_nulls().to_numpy()
            c_vals = control[var].drop_nulls().to_numpy()

            if t_vals.size == 0 or c_vals.size == 0 or not df.schema[var].is_numeric():
                rows.append({"variable": var, "ks_stat": None, "ks_p": None})
                continue

            combined_unique = np.unique(np.concatenate([t_vals, c_vals]))
            if combined_unique.size <= 2:
                rows.append({"variable": var, "ks_stat": None, "ks_p": None})
                continue

            stat, p_value = ks_2samp(t_vals, c_vals)
            rows.append({"variable": var, "ks_stat": float(stat), "ks_p": float(p_value)})

        return pl.DataFrame(rows)