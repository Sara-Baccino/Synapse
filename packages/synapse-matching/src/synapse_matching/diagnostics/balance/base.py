from __future__ import annotations
from abc import ABC, abstractmethod
from typing import ClassVar
import polars as pl

__all__ = ["BalanceMetric"]


class BalanceMetric(ABC):
    metric_name: ClassVar[str]

    @abstractmethod
    def compute(self, df: pl.DataFrame, treatment_column: str, covariates: list[str]) -> pl.DataFrame:
        """Returns a DataFrame with a 'variable' column plus metric-specific
        columns, one row per covariate. Non-applicable combinations
        (e.g. a continuous metric on a categorical column) return null
        values for that row, never an exception and never a silently
        dropped covariate."""
        raise NotImplementedError