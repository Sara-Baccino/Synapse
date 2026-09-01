from __future__ import annotations
import polars as pl
from synapse_matching.constraints.base import ConstraintResult, PopulationConstraint

__all__ = ["ExactMatchingConstraint"]


class ExactMatchingConstraint(PopulationConstraint):
    """Partitions the population into strata defined by identical values
    of the exact-match covariates. Distance/matching then operate only
    within each stratum, never across incompatible categories."""

    def __init__(self, exact_covariates: list[str]) -> None:
        self._exact_covariates = exact_covariates

    def apply(self, df: pl.DataFrame, treatment_col: str) -> ConstraintResult:
        if not self._exact_covariates:
            return ConstraintResult(strata={"__all__": df})

        strata: dict[str, pl.DataFrame] = {}
        groups = df.group_by(self._exact_covariates, maintain_order=True)
        for key_values, group_df in groups:
            key_str = "|".join(str(v) for v in (key_values if isinstance(key_values, tuple) else (key_values,)))
            strata[key_str] = group_df

        return ConstraintResult(
            strata=strata,
            metadata={"exact_covariates": self._exact_covariates, "n_strata": len(strata)},
        )