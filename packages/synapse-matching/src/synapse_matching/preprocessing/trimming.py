from __future__ import annotations
import numpy as np
import polars as pl
from pydantic import BaseModel, ConfigDict

__all__ = ["TrimmingRecord", "SymmetricOverlapTrimming"]


class TrimmingRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")
    lower_bound: float
    upper_bound: float
    n_before: int
    n_after: int
    n_dropped: int


class SymmetricOverlapTrimming:
    def apply(
        self, df: pl.DataFrame, ps_column: str, treatment_column: str, quantile: float = 0.02
    ) -> tuple[pl.DataFrame, TrimmingRecord]:
        treated = df.filter(pl.col(treatment_column) == 1)[ps_column]
        control = df.filter(pl.col(treatment_column) == 0)[ps_column]

        lower = max(treated.quantile(quantile), control.quantile(quantile))
        upper = min(treated.quantile(1 - quantile), control.quantile(1 - quantile))

        trimmed = df.filter((pl.col(ps_column) >= lower) & (pl.col(ps_column) <= upper))
        record = TrimmingRecord(
            lower_bound=float(lower), upper_bound=float(upper),
            n_before=df.height, n_after=trimmed.height, n_dropped=df.height - trimmed.height,
        )
        return trimmed, record