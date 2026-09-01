from __future__ import annotations
import polars as pl

from synapse_matching.diagnostics.balance.base import BalanceMetric

__all__ = ["VarianceRatioMetric"]


class VarianceRatioMetric(BalanceMetric):
    """Ratio of treated-group variance to control-group variance per
    covariate. A value close to 1 indicates comparable spread between
    groups; commonly flagged as imbalanced outside [0.5, 2.0]. Only
    meaningful for numeric covariates."""

    metric_name = "variance_ratio"

    def compute(self, df: pl.DataFrame, treatment_column: str, covariates: list[str]) -> pl.DataFrame:
        treated = df.filter(pl.col(treatment_column) == 1)
        control = df.filter(pl.col(treatment_column) == 0)

        rows = []
        for var in covariates:
            if not df.schema[var].is_numeric():
                rows.append({"variable": var, "variance_ratio": None})
                continue

            var_t = treated[var].var()
            var_c = control[var].var()
            ratio = (var_t / var_c) if var_c not in (0, None) and var_t is not None else None
            rows.append({"variable": var, "variance_ratio": float(ratio) if ratio is not None else None})

        return pl.DataFrame(rows)