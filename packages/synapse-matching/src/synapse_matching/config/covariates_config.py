from __future__ import annotations
from pydantic import BaseModel, ConfigDict, Field

__all__ = ["CovariatesConfig"]


class CovariatesConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    matching_covariates: list[str] = Field(min_length=1)
    evaluation_covariates: list[str] = Field(default_factory=list)
    outcome_covariates: list[str] = Field(default_factory=list)
    """Not consumed by any matching algorithm yet (causal_estimation is
    still a placeholder) -- captured here so they can already be tagged
    and later shown as pre/post distributions in Results, without waiting
    for outcome-analysis itself to be implemented."""
    covariate_missing_threshold: float = 0.20