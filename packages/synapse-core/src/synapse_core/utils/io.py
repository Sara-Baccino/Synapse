"""
synapse_core.utils.io
--------------------------

Generic AnalysisResult persistence: tables/datasets as parquet,
artifacts via joblib, figures in their native serialized format, and a
JSON summary + manifest describing what was written where.

This lives in synapse-core (not synapse-reporting) because
AnalysisResult itself is a core model: any analysis module (structure,
matching, network, validation) must be able to implement
AnalysisModule.save() using this primitive directly, without depending
on a downstream package. synapse-reporting builds PDF/HTML/Word report
generation on top of this, reusing it rather than duplicating it.
"""

from __future__ import annotations

import json
from pathlib import Path

import joblib
import polars as pl
from pydantic import BaseModel, ConfigDict

from synapse_core.exceptions import synapseError
from synapse_core.models.analysis_result import (
    AnalysisResult,
    Figure,
    FigureFormat,
    LogEntry,
    ResultMetadata,
)

__all__ = [
    "ResultManifest",
    "ResultPersistenceError",
    "save_analysis_result",
    "load_analysis_result",
]

_TABLES_DIR = "tables"
_DATASETS_DIR = "datasets"
_ARTIFACTS_DIR = "artifacts"
_FIGURES_DIR = "figures"
_MANIFEST_FILENAME = "manifest.json"
_SUMMARY_FILENAME = "summary.json"

_FIGURE_EXTENSIONS: dict[FigureFormat, str] = {
    FigureFormat.PNG: "png",
    FigureFormat.SVG: "svg",
    FigureFormat.HTML: "html",
    FigureFormat.JSON: "json",
}


class ResultPersistenceError(synapseError):
    """Raised when persisting or loading an AnalysisResult fails."""


class ResultManifest(BaseModel):
    """Describes where each AnalysisResult component was persisted, relative to the result folder."""

    model_config = ConfigDict(extra="forbid")

    tables: dict[str, str] = {}
    datasets: dict[str, str] = {}
    artifacts: dict[str, str] = {}
    figures: dict[str, str] = {}


def save_analysis_result(result: AnalysisResult, folder: str | Path) -> ResultManifest:
    """Persist every component of `result` under `folder`.

    Layout:
        folder/summary.json
        folder/manifest.json
        folder/tables/<name>.parquet
        folder/datasets/<name>.parquet
        folder/artifacts/<name>.joblib
        folder/figures/<name>.<ext>

    Note: `result.config` is intentionally NOT persisted here (not part
    of AnalysisResult.summary_dict() by design, see Phase 1) -- callers
    needing it preserved should persist it themselves alongside.

    :raises ResultPersistenceError: if writing any component fails.
    """
    base = Path(folder)
    try:
        base.mkdir(parents=True, exist_ok=True)

        manifest = ResultManifest(
            tables=_save_dataframes(result.tables, base, _TABLES_DIR),
            datasets=_save_dataframes(result.datasets, base, _DATASETS_DIR),
            artifacts=_save_artifacts(result.artifacts, base, _ARTIFACTS_DIR),
            figures=_save_figures(result.figures, base, _FIGURES_DIR),
        )

        (base / _MANIFEST_FILENAME).write_text(manifest.model_dump_json(indent=2), encoding="utf-8")
        (base / _SUMMARY_FILENAME).write_text(
            json.dumps(result.summary_dict(), indent=2, default=str), encoding="utf-8"
        )
        return manifest
    except OSError as exc:
        raise ResultPersistenceError(f"Failed to save result to '{base}': {exc}") from exc


def load_analysis_result(folder: str | Path) -> AnalysisResult:
    """Reconstruct a full AnalysisResult from a folder written by `save_analysis_result`.

    Metadata/metrics/logs/runtime come from summary.json; tables,
    datasets, artifacts and figures are rebuilt from manifest.json.
    `config` is reset to an empty dict (see the note in `save_analysis_result`).

    :raises ResultPersistenceError: if the folder, manifest, or summary
        is missing/unreadable, or the summary does not match the
        expected shape.
    """
    base = Path(folder)
    manifest_path = base / _MANIFEST_FILENAME
    summary_path = base / _SUMMARY_FILENAME

    if not manifest_path.is_file():
        raise ResultPersistenceError(f"Manifest not found: {manifest_path}")
    if not summary_path.is_file():
        raise ResultPersistenceError(f"Summary not found: {summary_path}")

    try:
        manifest = ResultManifest.model_validate_json(manifest_path.read_text(encoding="utf-8"))
        summary = json.loads(summary_path.read_text(encoding="utf-8"))

        tables = {name: pl.read_parquet(base / rel) for name, rel in manifest.tables.items()}
        datasets = {name: pl.read_parquet(base / rel) for name, rel in manifest.datasets.items()}
        artifacts = {name: joblib.load(base / rel) for name, rel in manifest.artifacts.items()}
        figures = {name: _load_figure(base / rel) for name, rel in manifest.figures.items()}

        return AnalysisResult(
            metadata=ResultMetadata(**summary["metadata"]),
            metrics=summary.get("metrics", {}),
            logs=[LogEntry(**entry) for entry in summary.get("logs", [])],
            runtime_seconds=summary.get("runtime_seconds"),
            runtime_breakdown=summary.get("runtime_breakdown", {}),
            success=summary.get("success", True),
            error=summary.get("error"),
            tables=tables,
            datasets=datasets,
            artifacts=artifacts,
            figures=figures,
        )
    except (OSError, ValueError, KeyError) as exc:
        raise ResultPersistenceError(f"Failed to load result from '{base}': {exc}") from exc


# ---------------------------------------------------------------------- #
# Internals
# ---------------------------------------------------------------------- #
def _save_dataframes(frames: dict[str, pl.DataFrame], base: Path, subdir: str) -> dict[str, str]:
    if not frames:
        return {}
    target_dir = base / subdir
    target_dir.mkdir(parents=True, exist_ok=True)

    relative_paths: dict[str, str] = {}
    for name, frame in frames.items():
        relative_path = f"{subdir}/{name}.parquet"
        frame.write_parquet(base / relative_path)
        relative_paths[name] = relative_path
    return relative_paths


def _save_artifacts(artifacts: dict[str, object], base: Path, subdir: str) -> dict[str, str]:
    if not artifacts:
        return {}
    target_dir = base / subdir
    target_dir.mkdir(parents=True, exist_ok=True)

    relative_paths: dict[str, str] = {}
    for name, artifact in artifacts.items():
        relative_path = f"{subdir}/{name}.joblib"
        joblib.dump(artifact, base / relative_path)
        relative_paths[name] = relative_path
    return relative_paths


def _save_figures(figures: dict[str, Figure], base: Path, subdir: str) -> dict[str, str]:
    if not figures:
        return {}
    target_dir = base / subdir
    target_dir.mkdir(parents=True, exist_ok=True)

    relative_paths: dict[str, str] = {}
    for name, figure in figures.items():
        extension = _FIGURE_EXTENSIONS[figure.format]
        relative_path = f"{subdir}/{name}.{extension}"
        mode = "wb" if isinstance(figure.data, bytes) else "w"
        with open(base / relative_path, mode, encoding=None if mode == "wb" else "utf-8") as file:
            file.write(figure.data)
        relative_paths[name] = relative_path
    return relative_paths


def _load_figure(path: Path) -> Figure:
    extension = path.suffix.lstrip(".")
    figure_format = next(fmt for fmt, ext in _FIGURE_EXTENSIONS.items() if ext == extension)
    if figure_format == FigureFormat.PNG:
        data: bytes | str = path.read_bytes()
    else:
        data = path.read_text(encoding="utf-8")
    return Figure(format=figure_format, data=data)
