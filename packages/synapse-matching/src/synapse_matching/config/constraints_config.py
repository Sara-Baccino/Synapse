from __future__ import annotations
from pydantic import BaseModel, ConfigDict, Field

__all__ = ["ConstraintsConfig"]


class ConstraintsConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    exact_match_covariates: list[str] = Field(default_factory=list)
    stratified_matching: bool = False