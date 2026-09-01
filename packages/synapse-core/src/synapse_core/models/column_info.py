"""
synapse_core.models.column_info
---------------------------------

Declarative, serializable description of a single dataset column.

This module intentionally contains no runtime/fitted state (e.g. fitted
scalers). Configuration must remain plain data: JSON-serializable,
diffable, and safe to persist or version. Any fitted artifacts produced
while acting on a ColumnInfo (a fitted StandardScaler, a fitted KNN
imputer, ...) belong to the pipeline's ExecutionContext or to an
AnalysisResult artifact, keyed by column name -- never to the config
itself.
"""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

__all__ = [
    "ColumnType",
    "MissingStrategy",
    "ImputerType",
    "ScalerType",
    "MissingDataManagement",
    "ScalingConfig",
    "ColumnInfo",
    "EncoderType", 
    "EncodingConfig"
]


class ColumnType(str, Enum):
    """Polars-aligned logical type used to cast a column."""

    INT = "int"
    INT64 = "int64"
    INT32 = "int32"
    FLOAT = "float"
    FLOAT64 = "float64"
    FLOAT32 = "float32"
    STRING = "string"
    BOOL = "bool"
    DATE = "date"
    DATETIME = "datetime"
    CATEGORY = "category"


class MissingStrategy(str, Enum):
    """How missing values in a column should be treated."""

    DROP = "drop"
    IMPUTE = "impute"
    REPLACE = "replace"
    MAINTAIN = "maintain"


class ImputerType(str, Enum):
    """Imputation algorithm to use when strategy == IMPUTE."""

    ZERO = "zero"
    MEAN = "mean"
    MEDIAN = "median"
    MOST_FREQUENT = "most_frequent"
    KNN = "knn"
    ITERATIVE = "iterative"


class ScalerType(str, Enum):
    """Scaling algorithm to use when scaling is enabled for a column."""

    NONE = "none"
    STANDARD = "standard"
    MINMAX = "minmax"
    ROBUST = "robust"


DEFAULT_MISSING_TOKENS: list[str] = [
    "NA", "na", "", " ", ".", "NaN", "nan", "/", "n/a", "N/A", "null", "NULL",
]


class MissingDataManagement(BaseModel):
    """Describes how missing values in a single column should be handled."""

    model_config = ConfigDict(extra="forbid")

    strategy: MissingStrategy = Field(
        default=MissingStrategy.MAINTAIN,
        description=(
            "drop: remove rows with missing values in this column. "
            "impute: infer missing values using `imputer`. "
            "replace: replace missing values with `value`. "
            "maintain: leave missing values untouched."
        ),
    )
    value: Any = Field(
        default=None,
        description="Replacement value used when strategy == replace.",
    )
    condition: list[Any] = Field(
        default_factory=lambda: DEFAULT_MISSING_TOKENS.copy(),
        description="Raw values in the source data considered 'missing'.",
    )
    imputer: ImputerType = Field(
        default=ImputerType.ZERO,
        description="Imputation algorithm. Ignored unless strategy == impute.",
    )

    @model_validator(mode="after")
    def _check_replace_has_value(self) -> "MissingDataManagement":
        if self.strategy == MissingStrategy.REPLACE and self.value is None:
            raise ValueError("strategy='replace' requires a non-null 'value'.")
        return self


class ScalingConfig(BaseModel):
    """Declarative scaling instructions for a single column.

    Only describes *intent*. The fitted scaler produced when this config
    is applied is a runtime artifact and lives outside DataConfig.
    """

    model_config = ConfigDict(extra="forbid")

    enabled: bool = Field(default=False, description="Whether to scale this column.")
    method: ScalerType = Field(
        default=ScalerType.NONE,
        description="Scaling algorithm to apply when enabled=True.",
    )

    @model_validator(mode="after")
    def _check_method_consistency(self) -> "ScalingConfig":
        if self.enabled and self.method == ScalerType.NONE:
            raise ValueError("scaling.enabled=True requires a method other than NONE.")
        if not self.enabled and self.method != ScalerType.NONE:
            raise ValueError("scaling.method set but scaling.enabled=False.")
        return self

class EncoderType(str, Enum):
    """Categorical encoding algorithm to use when encoding is enabled."""

    NONE = "none"
    ONE_HOT = "one_hot"
    ORDINAL = "ordinal"


class EncodingConfig(BaseModel):
    """Declarative categorical-encoding instructions for a single column.

    Only describes intent, mirroring ScalingConfig: the fitted encoder
    produced when this config is applied is a runtime artifact and lives
    outside DataConfig.
    """

    model_config = ConfigDict(extra="forbid")

    enabled: bool = Field(default=False, description="Whether to encode this column.")
    method: EncoderType = Field(
        default=EncoderType.NONE,
        description="Encoding algorithm to apply when enabled=True.",
    )
    order: list[Any] | None = Field(
        default=None,
        description=(
            "Explicit category order, low-to-high, used only when "
            "method == ORDINAL. Guarantees deterministic, domain-meaningful "
            "ordering (e.g. ['mild', 'moderate', 'severe']) instead of "
            "relying on incidental sort order. If None, categories are "
            "ordered alphabetically at fit time."
        ),
    )

    @model_validator(mode="after")
    def _check_method_consistency(self) -> "EncodingConfig":
        if self.enabled and self.method == EncoderType.NONE:
            raise ValueError("encoding.enabled=True requires a method other than NONE.")
        if not self.enabled and self.method != EncoderType.NONE:
            raise ValueError("encoding.method set but encoding.enabled=False.")
        if self.order is not None and self.method != EncoderType.ORDINAL:
            raise ValueError("encoding.order is only meaningful when method == ORDINAL.")
        return self


class ColumnInfo(BaseModel):
    """Declarative description of a single dataset column."""

    model_config = ConfigDict(extra="forbid")

    new_name: str = Field(description="Name assigned to the column after preprocessing.")
    active: bool = Field(default=True, description="Whether to keep this column at all.")

    categorical: bool = Field(default=False, description="Whether the column is categorical.")
    numerical: bool = Field(default=False, description="Whether the column is numerical.")
    id: bool = Field(default=False, description="Whether the column is a record identifier.")

    semantic_roles: set[str] = Field(
        default_factory=set,
        description=(
            "Free-form domain tags (e.g. 'gene', 'clinical', 'cytogenetic', "
            "'demographic'). Unlike SAFE, these are not hardcoded fields, so "
            "any domain vocabulary can be attached without changing the model."
        ),
    )

    multiplier: float = Field(default=1.0, description="Multiplier applied to numeric values.")
    mappings: dict[str, Any] = Field(
        default_factory=dict,
        description="Value substitutions applied to the column (e.g. category recoding).",
    )

    missing_data_management: MissingDataManagement = Field(
        default_factory=MissingDataManagement,
        description="How missing values in this column are handled.",
    )
    scaling: ScalingConfig = Field(
        default_factory=ScalingConfig,
        description="Declarative scaling instructions for this column.",
    )

    encoding: EncodingConfig = Field(
        default_factory=EncodingConfig,
        description="Declarative categorical-encoding instructions for this column.",
    )

    type: ColumnType | None = Field(default=None, description="Target type for casting.")

    @model_validator(mode="after")
    def _check_role_consistency(self) -> "ColumnInfo":
        if self.categorical and self.numerical:
            raise ValueError(
                f"Column '{self.new_name}': cannot be both categorical and numerical."
            )
        if self.id and (self.categorical or self.numerical or self.scaling.enabled or self.encoding.enabled):
            raise ValueError(
                f"Column '{self.new_name}': an id column cannot be categorical/numerical/scaled/encoded."
            )
        if self.encoding.enabled and not self.categorical:
            raise ValueError(
                f"Column '{self.new_name}': encoding is only meaningful for categorical columns."
            )
        return self
