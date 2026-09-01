from __future__ import annotations
from typing import Literal
import numpy as np
from scipy.spatial.distance import cdist

from synapse_matching.distance.base import DistanceMetric

__all__ = ["EuclideanDistance"]


class EuclideanDistance(DistanceMetric):
    def compute(self, X_treated, X_control, column_names, column_types) -> np.ndarray:
        self._check_all_numerical(column_names, column_types)
        return cdist(X_treated, X_control, metric="euclidean")