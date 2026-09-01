from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Literal
import numpy as np

__all__ = ["DistanceMetric"]


class DistanceMetric(ABC):
    @abstractmethod
    def compute(
        self,
        X_treated: np.ndarray,
        X_control: np.ndarray,
        column_names: list[str],
        column_types: dict[str, Literal["numerical", "categorical"]],
    ) -> np.ndarray:
        """Returns a (n_treated, n_control) pairwise distance matrix."""
        raise NotImplementedError

    def _check_all_numerical(self, column_names: list[str], column_types: dict[str, str]) -> None:
        non_numeric = [c for c in column_names if column_types.get(c) != "numerical"]
        if non_numeric:
            raise ValueError(
                f"{self.__class__.__name__} requires all-numerical columns, "
                f"got non-numerical: {non_numeric}. Use GowerDistance or "
                "WeightedMixedDistance for mixed-type covariates."
            )