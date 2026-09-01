from __future__ import annotations
from pydantic import BaseModel, ConfigDict, Field

__all__ = ["CovariatesConfig"]


class CovariatesConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    matching_covariates: list[str] = Field(min_length=1)
    evaluation_covariates: list[str] = Field(default_factory=list)
    covariate_missing_threshold: float = 0.20