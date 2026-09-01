from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Any
import numpy as np
from pydantic import BaseModel, ConfigDict

from synapse_matching.exceptions import MatchingError

__all__ = ["MatchingOutput", "MatchingAlgorithm"]


class MatchingOutput(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    matched_indices: dict[str, np.ndarray]     # {"query": ..., "pool": ...}
    pair_id: np.ndarray
    weights: np.ndarray
    unmatched_units: dict[str, np.ndarray]       # {"query": ...}
    distances: np.ndarray
    strategy_metadata: dict[str, Any]
    selection_mass: np.ndarray | None = None


class MatchingAlgorithm(ABC):
    def __init__(self) -> None:
        self._result: MatchingOutput | None = None

    @abstractmethod
    def fit(self, query_X: np.ndarray, pool_X: np.ndarray, config: BaseModel) -> "MatchingAlgorithm":
        raise NotImplementedError

    @abstractmethod
    def match(self) -> MatchingOutput:
        raise NotImplementedError

    def get_result(self) -> MatchingOutput:
        if self._result is None:
            raise MatchingError(f"{self.__class__.__name__}.match() must be called before get_result().")
        return self._result