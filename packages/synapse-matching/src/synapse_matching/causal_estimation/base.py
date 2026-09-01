"""
synapse_matching.causal_estimation.base
-----------------------------------------------

Contract-only module for Phase E (future). No implementation exists
yet -- CausalEstimator is defined so the architecture has a stable
place for this layer, but nothing here is wired into MatchingModule.run()
until a dedicated research/validation phase produces a verified
reference implementation.
"""

from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Any
import polars as pl

__all__ = ["CausalEstimator"]


class CausalEstimator(ABC):
    @abstractmethod
    def estimate(self, matched_dataset: pl.DataFrame, outcome_col: str, treatment_col: str) -> dict[str, Any]:
        """Not implemented by any concrete class yet. Reserved for Phase E."""
        raise NotImplementedError