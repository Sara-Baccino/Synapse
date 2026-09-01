"""
synapse_core.models.analysis_result
--------------------------------------

Universal return object for every analysis module. Every module (dataset
profiling, missing-data analysis, clustering, matching, validation of
synthetic datasets, ...) returns exactly this shape, so that
synapse-reporting and synapse-gui can consume any result without ever
knowing which module produced it.

Design note: this model intentionally has no knowledge of any concrete
module (no ClusteringResult, no MatchingResult, ...). Module-specific
content lives inside the generic containers (metrics, tables, figures,
datasets, artifacts) as plain dict entries keyed by name.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any

import polars as pl
from pydantic import BaseModel, ConfigDict, Field

__all__ = [
    "LogLevel",
    "LogEntry",
    "FigureFormat",
    "Figure",
    "ResultMetadata",
    "AnalysisResult",
]


class LogLevel(str, Enum):
    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


class LogEntry(BaseModel):
    """A single structured log line produced during module execution."""

    model_config = ConfigDict(extra="forbid")

    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    level: LogLevel = LogLevel.INFO
    message: str


class FigureFormat(str, Enum):
    PNG = "png"
    SVG = "svg"
    HTML = "html"
    JSON = "json"  # e.g. a plotly figure serialized via to_json()


class Figure(BaseModel):
    """A serialized visual artifact, decoupled from any plotting library.

    `data` holds the already-serialized payload (e.g. PNG bytes, SVG
    markup, an HTML snippet, or a plotly JSON string) so AnalysisResult
    never needs matplotlib/plotly as a dependency.
    """

    model_config = ConfigDict(extra="forbid")

    format: FigureFormat
    data: bytes | str
    caption: str | None = None


class ResultMetadata(BaseModel):
    """Provenance information about how/when a result was produced."""

    model_config = ConfigDict(extra="forbid")

    module_name: str
    module_version: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    dataset_name: str | None = None
    description: str | None = None
    tags: set[str] = Field(default_factory=set)


class AnalysisResult(BaseModel):
    """Universal result object returned by every AnalysisModule."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    metadata: ResultMetadata

    metrics: dict[str, float | int | str | bool] = Field(
        default_factory=dict,
        description="Scalar, JSON-friendly metrics (e.g. {'silhouette_score': 0.42}).",
    )
    figures: dict[str, Figure] = Field(
        default_factory=dict,
        description="Named visual artifacts, serialized (no plotting-library objects).",
    )
    tables: dict[str, pl.DataFrame] = Field(
        default_factory=dict,
        description="Small, report-oriented tables (e.g. a missingness summary).",
    )
    datasets: dict[str, pl.DataFrame] = Field(
        default_factory=dict,
        description="Output datasets meant for export/downstream consumption "
        "(e.g. dataset with assigned cluster labels).",
    )
    artifacts: dict[str, Any] = Field(
        default_factory=dict,
        description="Anything else produced by the module: fitted scalers/imputers "
        "(keyed by column name), similarity graphs, embeddings, binary blobs, ...",
    )
    logs: list[LogEntry] = Field(default_factory=list)

    runtime_seconds: float | None = Field(
        default=None, description="Total wall-clock time for the module run."
    )
    runtime_breakdown: dict[str, float] = Field(
        default_factory=dict,
        description="Optional per-step timings, e.g. {'load': 0.1, 'preprocess': 1.2}.",
    )

    config: dict[str, Any] = Field(
        default_factory=dict,
        description="Serialized snapshot of the DataConfig and module-specific "
        "config used to produce this result. Kept untyped so synapse-core "
        "never has to import a concrete ModuleConfig.",
    )

    success: bool = Field(default=True, description="Whether the module run completed without error.")
    error: str | None = Field(default=None, description="Error message, if success is False.")

    # ------------------------------------------------------------------ #
    # Builder-style helpers, used by AnalysisModule implementations
    # ------------------------------------------------------------------ #
    def add_metric(self, name: str, value: float | int | str | bool) -> None:
        self.metrics[name] = value

    def add_table(self, name: str, table: pl.DataFrame) -> None:
        self.tables[name] = table

    def add_dataset(self, name: str, dataset: pl.DataFrame) -> None:
        self.datasets[name] = dataset

    def add_figure(self, name: str, figure: Figure) -> None:
        self.figures[name] = figure

    def add_artifact(self, name: str, artifact: Any) -> None:
        self.artifacts[name] = artifact

    def log(self, message: str, level: LogLevel = LogLevel.INFO) -> None:
        self.logs.append(LogEntry(level=level, message=message))

    def mark_failed(self, error: str) -> None:
        self.success = False
        self.error = error
        self.log(error, level=LogLevel.ERROR)

    # ------------------------------------------------------------------ #
    # Serialization convenience (excludes polars DataFrames, handled by
    # ArtifactManager/ReportManager which know how to persist them, e.g.
    # to parquet, rather than forcing a lossy JSON round-trip here).
    # ------------------------------------------------------------------ #
    def summary_dict(self) -> dict[str, Any]:
        """JSON-safe summary excluding heavy/non-JSON-native fields
        (tables, datasets, artifacts). Intended for quick GUI previews
        and logging; full persistence is ArtifactManager's job.
        """
        return {
            "metadata": self.metadata.model_dump(mode="json"),
            "metrics": self.metrics,
            "logs": [entry.model_dump(mode="json") for entry in self.logs],
            "runtime_seconds": self.runtime_seconds,
            "runtime_breakdown": self.runtime_breakdown,
            "success": self.success,
            "error": self.error,
        }
