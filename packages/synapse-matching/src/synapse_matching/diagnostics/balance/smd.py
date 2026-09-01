from __future__ import annotations
import numpy as np
import polars as pl

from synapse_matching.diagnostics.balance.base import BalanceMetric

__all__ = ["StandardizedMeanDifferenceMetric"]


class StandardizedMeanDifferenceMetric(BalanceMetric):
    metric_name = "smd"

    def compute(
        self, df: pl.DataFrame, treatment_column: str, covariates: list[str], weight_column: str | None = None
    ) -> pl.DataFrame:
        treated = df.filter(pl.col(treatment_column) == 1)
        control = df.filter(pl.col(treatment_column) == 0)

        rows = []
        for var in covariates:
            if not df.schema[var].is_numeric():
                rows.append({"variable": var, "smd": None, "abs_smd": None})
                continue

            if treated.height == 0 or control.height == 0:
                # One of the two groups is entirely absent -- e.g. a
                # population-selection strategy (Optimal Transport) whose
                # matched_dataset contains only pool units, no query
                # units. SMD is not computable without both groups; null
                # is returned explicitly rather than crashing on a None
                # arithmetic operation.
                rows.append({"variable": var, "smd": None, "abs_smd": None})
                continue

            if weight_column is None:
                m1, m0 = treated[var].mean(), control[var].mean()
                s1, s0 = treated[var].std(), control[var].std()
            else:
                t_vals, t_w = treated[var].to_numpy(), treated[weight_column].to_numpy()
                c_vals, c_w = control[var].to_numpy(), control[weight_column].to_numpy()
                m1, m0 = np.average(t_vals, weights=t_w), np.average(c_vals, weights=c_w)
                s1 = np.sqrt(np.average((t_vals - m1) ** 2, weights=t_w))
                s0 = np.sqrt(np.average((c_vals - m0) ** 2, weights=c_w))

            if m1 is None or m0 is None:
                rows.append({"variable": var, "smd": None, "abs_smd": None})
                continue

            pooled_sd = np.sqrt(((s1 or 0) ** 2 + (s0 or 0) ** 2) / 2)
            smd = (m1 - m0) / pooled_sd if pooled_sd not in (0, None) else 0.0
            rows.append({"variable": var, "smd": float(smd), "abs_smd": abs(float(smd))})

        return pl.DataFrame(rows)

    def compute_single(self, df: pl.DataFrame, treatment_column: str, variable: str) -> float | None:
        return self.compute(df, treatment_column, [variable])["smd"][0]