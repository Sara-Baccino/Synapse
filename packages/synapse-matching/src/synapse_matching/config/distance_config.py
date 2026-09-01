from __future__ import annotations
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field

__all__ = ["DistanceConfig"]


class DistanceConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    distance_metric: Literal["euclidean", "mahalanobis", "gower", "ps_logit", "weighted_hybrid"] = "euclidean"
    weight_numerical: float = 0.6
    """Used only when distance_metric == 'weighted_hybrid'."""
    weight_categorical: float = 0.4
    """Used only when distance_metric == 'weighted_hybrid'."""
    distance_params: dict[str, Any] = Field(default_factory=dict)