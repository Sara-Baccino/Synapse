from __future__ import annotations
from typing import Literal
from pydantic import BaseModel, ConfigDict, model_validator

from synapse_matching.representation.propensity_score import PropensityScoreConfig

__all__ = ["RepresentationConfig"]


class RepresentationConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    use_propensity_score: bool = False
    ps_method: Literal["logistic", "random_forest", "lightgbm"] = "logistic"
    ps_config: PropensityScoreConfig | None = None
    matching_space: Literal["covariates_only", "ps_only", "logit_ps_only", "hybrid_covariates_and_ps"] = "covariates_only"

    @model_validator(mode="after")
    def _check_ps_config_consistency(self) -> "RepresentationConfig":
        if self.use_propensity_score and self.ps_config is None:
            self.ps_config = PropensityScoreConfig()
        if not self.use_propensity_score and self.ps_config is not None:
            raise ValueError("ps_config set but use_propensity_score is False.")
        if self.matching_space in ("ps_only", "logit_ps_only", "hybrid_covariates_and_ps") and not self.use_propensity_score:
            raise ValueError(
                f"matching_space='{self.matching_space}' requires use_propensity_score=True."
            )
        return self