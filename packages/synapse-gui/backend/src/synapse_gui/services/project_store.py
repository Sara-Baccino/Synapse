"""
synapse_gui.services.project_store
--------------------------------------

Minimal Project entity: a named, resumable workspace a user returns to
from the pre-workspace "All Projects" landing page. This store only owns
the Project record itself (id/name/owner/created_at) plus the list of
dataset_ids/job_ids tagged as belonging to it; the actual DatasetRecord/
JobRecord objects still live in dataset_store/job_manager as before --
this is deliberately not a second, competing source of truth for them.

Same persistence pattern already used for matching runs (RUNS_DIR): an
in-memory registry mirrored to one JSON file per record on disk, so the
project list survives a process restart even without a real database.
"""

from __future__ import annotations

import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field

__all__ = ["PROJECTS_DIR", "ProjectNotFoundError", "ProjectRecord", "ProjectStore", "project_store"]

PROJECTS_DIR = Path(tempfile.gettempdir()) / "synapse_projects"


class ProjectNotFoundError(Exception):
    pass


class ProjectRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")
    project_id: str
    name: str
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    dataset_ids: list[str] = Field(default_factory=list)
    job_ids: list[str] = Field(default_factory=list)


class ProjectStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._projects: dict[str, ProjectRecord] = {}
        self._load_from_disk()

    def _load_from_disk(self) -> None:
        if not PROJECTS_DIR.exists():
            return
        for path in sorted(PROJECTS_DIR.glob("*.json")):
            try:
                record = ProjectRecord.model_validate_json(path.read_text())
            except Exception:
                continue  # a corrupted/partial file must not break startup
            self._projects[record.project_id] = record

    def _persist(self, record: ProjectRecord) -> None:
        PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
        (PROJECTS_DIR / f"{record.project_id}.json").write_text(record.model_dump_json())

    def create(self, name: str, created_by: str) -> ProjectRecord:
        record = ProjectRecord(project_id=str(uuid4()), name=name, created_by=created_by)
        with self._lock:
            self._projects[record.project_id] = record
        self._persist(record)
        return record

    def list(self) -> list[ProjectRecord]:
        with self._lock:
            records = list(self._projects.values())
        return sorted(records, key=lambda r: r.created_at, reverse=True)

    def get(self, project_id: str) -> ProjectRecord:
        with self._lock:
            record = self._projects.get(project_id)
        if record is None:
            raise ProjectNotFoundError(f"No project found with id '{project_id}'.")
        return record

    def rename(self, project_id: str, new_name: str) -> ProjectRecord:
        with self._lock:
            record = self._projects.get(project_id)
            if record is None:
                raise ProjectNotFoundError(f"No project found with id '{project_id}'.")
            updated = record.model_copy(update={"name": new_name})
            self._projects[project_id] = updated
        self._persist(updated)
        return updated

    def delete(self, project_id: str) -> None:
        with self._lock:
            if project_id not in self._projects:
                raise ProjectNotFoundError(f"No project found with id '{project_id}'.")
            del self._projects[project_id]
        path = PROJECTS_DIR / f"{project_id}.json"
        if path.exists():
            path.unlink()

    def add_dataset(self, project_id: str, dataset_id: str) -> ProjectRecord:
        """Tags a dataset as belonging to this project. Idempotent. Used
        by Block B (workspace Datasets sidebar box); exposed here already
        so that block doesn't need to touch this store's internals."""
        with self._lock:
            record = self._projects.get(project_id)
            if record is None:
                raise ProjectNotFoundError(f"No project found with id '{project_id}'.")
            updated = (
                record
                if dataset_id in record.dataset_ids
                else record.model_copy(update={"dataset_ids": [*record.dataset_ids, dataset_id]})
            )
            self._projects[project_id] = updated
        self._persist(updated)
        return updated

    def add_job(self, project_id: str, job_id: str) -> ProjectRecord:
        with self._lock:
            record = self._projects.get(project_id)
            if record is None:
                raise ProjectNotFoundError(f"No project found with id '{project_id}'.")
            updated = (
                record
                if job_id in record.job_ids
                else record.model_copy(update={"job_ids": [*record.job_ids, job_id]})
            )
            self._projects[project_id] = updated
        self._persist(updated)
        return updated


project_store = ProjectStore()