from __future__ import annotations
import polars as pl
from pydantic import BaseModel, ConfigDict

__all__ = ["CovariateAvailabilityReport", "CovariateAvailabilityFilter"]


class CovariateAvailabilityReport(BaseModel):
    model_config = ConfigDict(extra="forbid")
    usable_covariates: list[str]
    excluded_covariates: list[str]
    missing_pct_by_covariate: dict[str, float]
    threshold: float


class CovariateAvailabilityFilter:
    def compute(
        self, df: pl.DataFrame, covariates: list[str], treatment_column: str, threshold: float = 0.20
    ) -> CovariateAvailabilityReport:
        treated = df.filter(pl.col(treatment_column) == 1)
        control = df.filter(pl.col(treatment_column) == 0)

        usable, excluded, missing_pct = [], [], {}
        for var in covariates:
            missing_t = treated[var].null_count() / max(treated.height, 1)
            missing_c = control[var].null_count() / max(control.height, 1)
            missing_pct[var] = float(max(missing_t, missing_c))
            (usable if missing_t < threshold and missing_c < threshold else excluded).append(var)

        return CovariateAvailabilityReport(
            usable_covariates=usable, excluded_covariates=excluded,
            missing_pct_by_covariate=missing_pct, threshold=threshold,
        )