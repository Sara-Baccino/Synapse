from __future__ import annotations
from typing import Literal
from pydantic import BaseModel, ConfigDict

__all__ = ["NearestNeighborMatchingConfig"]


class NearestNeighborMatchingConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    caliper: float | None = None
    replacement: bool = False