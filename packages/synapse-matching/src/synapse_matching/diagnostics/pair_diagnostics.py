from __future__ import annotations
import numpy as np
from pydantic import BaseModel, ConfigDict

__all__ = ["PairDiagnosticsResult", "PairDiagnostics"]


class PairDiagnosticsResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    n_pairs: int
    mean_distance: float
    median_distance: float
    min_distance: float
    max_distance: float
    p25_distance: float
    p75_distance: float
    n_pool_units_reused: int


class PairDiagnostics:
    def compute(self, distances: np.ndarray, pool_indices: np.ndarray) -> PairDiagnosticsResult:
        if distances.size == 0:
            return PairDiagnosticsResult(
                n_pairs=0, mean_distance=0.0, median_distance=0.0,
                min_distance=0.0, max_distance=0.0, p25_distance=0.0, p75_distance=0.0,
                n_pool_units_reused=0,
            )
        unique, counts = np.unique(pool_indices, return_counts=True)
        return PairDiagnosticsResult(
            n_pairs=int(distances.size),
            mean_distance=float(np.mean(distances)),
            median_distance=float(np.median(distances)),
            min_distance=float(np.min(distances)),
            max_distance=float(np.max(distances)),
            p25_distance=float(np.percentile(distances, 25)),
            p75_distance=float(np.percentile(distances, 75)),
            n_pool_units_reused=int(np.sum(counts > 1)),
        )