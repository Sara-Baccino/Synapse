from __future__ import annotations
import polars as pl
from synapse_matching.constraints.base import ConstraintResult, PopulationConstraint
from synapse_matching.constraints.exact_matching import ExactMatchingConstraint

__all__ = ["StratifiedMatchingConstraint"]


class StratifiedMatchingConstraint(PopulationConstraint):
    """Explicit alias over ExactMatchingConstraint: 'stratified_matching'
    and 'exact_match_covariates' are the same partitioning mechanism
    conceptually -- stratification is exact matching applied as an
    independence constraint on strategy execution, not a different
    algorithm (per Phase A decision)."""

    def __init__(self, strata_covariates: list[str]) -> None:
        self._delegate = ExactMatchingConstraint(strata_covariates)

    def apply(self, df: pl.DataFrame, treatment_col: str) -> ConstraintResult:
        return self._delegate.apply(df, treatment_col)