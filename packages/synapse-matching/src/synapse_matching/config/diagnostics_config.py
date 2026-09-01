from __future__ import annotations
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

__all__ = ["DiagnosticsConfig"]


class DiagnosticsConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    run_overlap_diagnostics: bool = True
    run_pair_diagnostics: bool = True
    run_balance_diagnostics: bool = True
    balance_metrics: list[Literal["smd", "variance_ratio", "ks_test", "chi_square"]] = Field(default_factory=lambda: ["smd"])