from __future__ import annotations
from abc import ABC, abstractmethod
import polars as pl
from pydantic import BaseModel, ConfigDict

__all__ = ["ConstraintResult", "PopulationConstraint"]


class ConstraintResult(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    strata: dict[str, pl.DataFrame]
    """Maps a stratum key (e.g. 'M|centerA', or '__all__' if no
    constraint applies) to the sub-population dataframe for that stratum."""
    metadata: dict = {}


class PopulationConstraint(ABC):
    @abstractmethod
    def apply(self, df: pl.DataFrame, treatment_col: str) -> ConstraintResult:
        raise NotImplementedError