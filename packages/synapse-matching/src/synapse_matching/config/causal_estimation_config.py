from __future__ import annotations
from typing import Literal
from pydantic import BaseModel, ConfigDict

__all__ = ["CausalEstimationConfig"]


class CausalEstimationConfig(BaseModel):
    """Contract-only placeholder (Phase E). Any instantiation with a
    non-None estimand is rejected by MatchingModuleConfig validation
    until the causal_estimation layer actually exists -- this class
    exists only so the JSON Schema field is present and stable for the
    frontend to render as 'coming soon'."""

    model_config = ConfigDict(extra="forbid")
    estimand: Literal["ATT", "ATC", "ATE"] | None = None