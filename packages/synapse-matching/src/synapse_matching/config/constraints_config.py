from __future__ import annotations
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

__all__ = ["CaliperWindowSpec", "ConstraintsConfig"]


class CaliperWindowSpec(BaseModel):
    """A per-covariate hard tolerance window: a (query, pool) pair is
    valid on this covariate only if |query_value - pool_value| <=
    caliper_value (scaled by the covariate's pooled standard deviation
    when scale="standard_deviation"). Generalizes exact matching (which
    only supports exact equality) to continuous covariates.

    For a covariate that is actually categorical, this still resolves to
    exact equality regardless of caliper_value/scale -- there is no
    numeric "distance" for a category, so the window concept doesn't
    apply; this is enforced by CaliperWindowFilter, not here.
    """
    model_config = ConfigDict(extra="forbid")
    covariate: str
    caliper_value: float = Field(gt=0)
    scale: Literal["absolute", "standard_deviation"] = "absolute"


class ConstraintsConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    exact_match_covariates: list[str] = Field(default_factory=list)
    stratified_matching: bool = False
    caliper_windows: list[CaliperWindowSpec] = Field(default_factory=list)
    """Hard per-covariate tolerance constraints, applied pairwise (not as
    a stratification: a continuous tolerance window cannot be partitioned
    into non-overlapping discrete strata the way exact equality can).
    Enforced by CaliperWindowFilter directly on each stratum's distance
    matrix, independently of exact_match_covariates/stratified_matching."""