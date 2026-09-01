"""
synapse_core.pipeline.execution_context
--------------------------------------------

Runtime state produced during preprocessing that belongs neither to
DataConfig (declarative, JSON-serializable) nor to a module-specific
ModuleConfig (algorithm parameters): fitted scalers/encoders/imputers,
and preprocessing flags (e.g. whether imputation was applied). Created
once per pipeline run and passed, read-only, to AnalysisModule.fit().
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field

from synapse_core.dataset.imputation import FittedImputers
from synapse_core.dataset.scaling import FittedScalers
from synapse_core.dataset.transformers import FittedEncoders
from synapse_core.exceptions import PipelineError

__all__ = ["ExecutionContext"]


class ExecutionContext(BaseModel):
    """Runtime, non-declarative state shared across a single pipeline run."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    run_id: str = Field(default_factory=lambda: str(uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    fitted_scalers: FittedScalers = Field(default_factory=dict)
    fitted_encoders: FittedEncoders = Field(default_factory=dict)
    fitted_imputers: FittedImputers = Field(default_factory=dict)

    imputation_applied: bool = Field(
        default=False,
        description=(
            "Whether Imputation.fit_transform was actually run for this "
            "context. Modules that care about missing-value semantics "
            "(profiling, discovery, cleaning) should check this before "
            "interpreting residual nulls in the dataset they receive."
        ),
    )

    step_timings: dict[str, float] = Field(
        default_factory=dict,
        description="Wall-clock seconds per preprocessing step (e.g. {'scaling': 0.4}).",
    )

    # ------------------------------------------------------------------ #
    # Typed accessors
    # ------------------------------------------------------------------ #
    def get_scaler(self, column_name: str):
        if column_name not in self.fitted_scalers:
            raise PipelineError(f"No fitted scaler found for column '{column_name}'.")
        return self.fitted_scalers[column_name]

    def get_encoder(self, column_name: str):
        if column_name not in self.fitted_encoders:
            raise PipelineError(f"No fitted encoder found for column '{column_name}'.")
        return self.fitted_encoders[column_name]

    def get_imputer(self, column_name: str):
        if column_name not in self.fitted_imputers:
            raise PipelineError(f"No fitted imputer found for column '{column_name}'.")
        return self.fitted_imputers[column_name]

    # ------------------------------------------------------------------ #
    # Bookkeeping helpers, used by BasePipeline
    # ------------------------------------------------------------------ #
    def record_step_timing(self, step_name: str, seconds: float) -> None:
        self.step_timings[step_name] = seconds

    def artifacts_summary(self) -> dict[str, list[str] | bool]:
        """JSON-safe summary for audit/reporting (no raw sklearn objects)."""
        return {
            "scaled_columns": sorted(self.fitted_scalers.keys()),
            "encoded_columns": sorted(self.fitted_encoders.keys()),
            "imputed_columns": sorted(self.fitted_imputers.keys()),
            "imputation_applied": self.imputation_applied,
        }
