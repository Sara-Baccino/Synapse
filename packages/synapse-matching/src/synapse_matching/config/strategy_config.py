from __future__ import annotations
from typing import Literal
from pydantic import BaseModel, ConfigDict, model_validator, Field

__all__ = ["StrategyConfig"]


class StrategyConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    matching_algorithm: Literal["greedy_nn", "optimal_hungarian", "optimal_transport_sinkhorn", "full_matching"] = "greedy_nn"
    matching_ratio_k: int = Field(default=1, ge=1)
    allow_replacement: bool = False
    caliper_value: float | None = None
    caliper_scale: Literal["absolute", "standard_deviation"] = "absolute"
    ties_handling: Literal["first", "random_seeded"] = "first"

    optimal_transport_target_size: int | None = None
    """Required only when matching_algorithm == 'optimal_transport_sinkhorn'."""

    apply_candidate_prefilter: bool = False
    prefilter_k_neighbors: int = 7
    prefilter_min_candidates: int | None = None

    @model_validator(mode="after")
    def _check_hungarian_no_replacement(self) -> "StrategyConfig":
        if self.matching_algorithm == "optimal_hungarian" and self.allow_replacement:
            raise ValueError("optimal_hungarian requires allow_replacement=False (unique assignment).")
        return self

    @model_validator(mode="after")
    def _check_ot_target_size(self) -> "StrategyConfig":
        if self.matching_algorithm == "optimal_transport_sinkhorn" and self.optimal_transport_target_size is None:
            raise ValueError("optimal_transport_sinkhorn requires optimal_transport_target_size to be set.")
        if self.matching_algorithm != "optimal_transport_sinkhorn" and self.optimal_transport_target_size is not None:
            raise ValueError("optimal_transport_target_size set but matching_algorithm is not optimal_transport_sinkhorn.")
        return self