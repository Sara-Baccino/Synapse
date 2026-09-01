from __future__ import annotations
from typing import Literal
from pydantic import BaseModel, ConfigDict

__all__ = ["PopulationConfig"]


class PopulationConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    treatment_col: str
    matching_direction: Literal["treated_to_control", "control_to_treated", "bidirectional_full"] = "treated_to_control"
    id_col: str | None = None