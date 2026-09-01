from __future__ import annotations
import numpy as np
import polars as pl
from scipy.stats import chi2_contingency

from synapse_matching.diagnostics.balance.base import BalanceMetric

__all__ = ["ChiSquareBalanceTest"]


class ChiSquareBalanceTest(BalanceMetric):
    """Chi-square test of independence between treatment group and a
    categorical/binary covariate (2 or fewer unique combined values,
    same heuristic as the legacy code). Continuous covariates return
    null -- use KolmogorovSmirnovBalanceTest for those instead."""

    metric_name = "chi_square"

    def compute(self, df: pl.DataFrame, treatment_column: str, covariates: list[str]) -> pl.DataFrame:
        rows = []
        for var in covariates:
            sub = df.select([treatment_column, var]).drop_nulls()
            if sub.height == 0:
                rows.append({"variable": var, "chi2_stat": None, "chi2_p": None})
                continue

            unique_values = sorted(sub[var].unique().to_list(), key=str)
            if len(unique_values) > 2:
                rows.append({"variable": var, "chi2_stat": None, "chi2_p": None})
                continue

            table = np.zeros((2, len(unique_values)))
            for row_idx, group in enumerate((0, 1)):
                group_values = sub.filter(pl.col(treatment_column) == group)[var].to_list()
                for col_idx, value in enumerate(unique_values):
                    table[row_idx, col_idx] = group_values.count(value)

            try:
                stat, p_value, _, _ = chi2_contingency(table)
            except ValueError:
                rows.append({"variable": var, "chi2_stat": None, "chi2_p": None})
                continue

            rows.append({"variable": var, "chi2_stat": float(stat), "chi2_p": float(p_value)})

        return pl.DataFrame(rows)