"""
synapse_reporting.artifact_manager
--------------------------------------

Thin, reporting-facing wrapper around synapse_core.utils.io. The
actual persistence mechanics (parquet/joblib/manifest) live in
synapse-core, since AnalysisResult itself is a core model and every
analysis module's save() must be able to use it without depending on
synapse-reporting. This wrapper exists only for naming continuity in
the reporting/backend/GUI layer.
"""

from __future__ import annotations

from pathlib import Path

from synapse_core.models.analysis_result import AnalysisResult
from synapse_core.utils.io import (
    ResultManifest as ArtifactManifest,
    ResultPersistenceError as ArtifactPersistenceError,
    load_analysis_result,
    save_analysis_result,
)

__all__ = ["ArtifactManager", "ArtifactManifest", "ArtifactPersistenceError"]


class ArtifactManager:
    """Reporting-facing facade over synapse_core.utils.io's result persistence."""

    @staticmethod
    def save(result: AnalysisResult, folder: str | Path) -> ArtifactManifest:
        return save_analysis_result(result, folder)

    @staticmethod
    def load(folder: str | Path) -> AnalysisResult:
        return load_analysis_result(folder)