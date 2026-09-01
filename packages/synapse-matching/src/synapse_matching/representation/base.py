from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Any
import numpy as np
from pydantic import BaseModel, ConfigDict, Field

__all__ = ["RepresentationOutput", "RepresentationAlgorithm"]


class RepresentationOutput(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    representation: np.ndarray
    feature_names: list[str]
    metadata: dict[str, Any] = Field(default_factory=dict)
    transformations: list[str] = Field(default_factory=list)
    representation_logit: np.ndarray | None = None
    model: Any = None


class RepresentationAlgorithm(ABC):
    @abstractmethod
    def fit_transform(self, X: np.ndarray, treatment: np.ndarray, config: BaseModel) -> RepresentationOutput:
        raise NotImplementedError