from __future__ import annotations
import numpy as np
from pydantic import BaseModel, ConfigDict

__all__ = ["OverlapDiagnosticResult", "OverlapDiagnostic"]


class OverlapDiagnosticResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    treated_ps_min: float
    treated_ps_max: float
    control_ps_min: float
    control_ps_max: float
    common_support_min: float
    common_support_max: float


class OverlapDiagnostic:
    def compute(self, ps_treated: np.ndarray, ps_control: np.ndarray) -> OverlapDiagnosticResult:
        common_min = max(ps_treated.min(), ps_control.min())
        common_max = min(ps_treated.max(), ps_control.max())
        return OverlapDiagnosticResult(
            treated_ps_min=float(ps_treated.min()), treated_ps_max=float(ps_treated.max()),
            control_ps_min=float(ps_control.min()), control_ps_max=float(ps_control.max()),
            common_support_min=float(common_min), common_support_max=float(common_max),
        )