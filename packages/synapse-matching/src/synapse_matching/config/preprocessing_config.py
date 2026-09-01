from __future__ import annotations
from typing import Literal
from pydantic import BaseModel, ConfigDict

__all__ = ["MatchingPreprocessingConfig"]


class MatchingPreprocessingConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    apply_trimming: bool = False
    trimming_strategy: Literal["none", "symmetric_quantile", "crump_optimal", "kde_density"] = "none"
    trim_quantile: float = 0.02