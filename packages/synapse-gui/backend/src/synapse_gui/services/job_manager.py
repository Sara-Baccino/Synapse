"""
synapse_gui.services.job_manager
----------------------------------------

Thread-safe, in-memory job state manager for background execution via
FastAPI's BackgroundTasks. Identical to synclair-gui's job_manager.py:
already fully generic (result: Any), no changes needed for Synapse.
"""

from __future__ import annotations

import threading
import traceback
from collections.abc import Callable
from datetime import datetime, timezone
from enum import Enum
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field

__all__ = [
    "JobStatus", "JobProgress", "JobRecord", "JobProgressReporter",
    "JobNotFoundError", "JobManager", "job_manager",
]


class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class JobProgress(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str = "Queued."
    percentage: float | None = Field(default=None, ge=0.0, le=100.0)
    logs: list[str] = Field(default_factory=list)


class JobRecord(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True, extra="forbid")
    job_id: str
    status: JobStatus = JobStatus.PENDING
    progress: JobProgress = Field(default_factory=JobProgress)
    result: Any = None
    error: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class JobNotFoundError(Exception):
    """Raised when a job_id does not exist in the manager."""


class JobProgressReporter:
    def __init__(self, manager: "JobManager", job_id: str) -> None:
        self._manager = manager
        self._job_id = job_id

    def update(self, message: str, percentage: float | None = None) -> None:
        self._manager._update_progress(self._job_id, message, percentage)


class JobManager:
    def __init__(self) -> None:
        self._jobs: dict[str, JobRecord] = {}
        self._lock = threading.Lock()

    def create_job(self) -> str:
        job_id = str(uuid4())
        with self._lock:
            self._jobs[job_id] = JobRecord(job_id=job_id)
        return job_id

    def get_job(self, job_id: str) -> JobRecord:
        with self._lock:
            record = self._jobs.get(job_id)
        if record is None:
            raise JobNotFoundError(f"No job found with id '{job_id}'.")
        return record.model_copy(deep=True)

    def run_job(self, job_id: str, target: Callable[[JobProgressReporter], Any]) -> None:
        self._set_status(job_id, JobStatus.RUNNING)
        reporter = JobProgressReporter(self, job_id)
        try:
            result = target(reporter)
        except Exception:  # noqa: BLE001
            self._mark_failed(job_id, traceback.format_exc())
            return
        self._mark_completed(job_id, result)

    def _set_status(self, job_id: str, status: JobStatus) -> None:
        with self._lock:
            record = self._require_locked(job_id)
            record.status = status
            record.updated_at = datetime.now(timezone.utc)

    def _update_progress(self, job_id: str, message: str, percentage: float | None) -> None:
        with self._lock:
            record = self._require_locked(job_id)
            record.progress.message = message
            if percentage is not None:
                record.progress.percentage = percentage
            record.progress.logs.append(message)
            record.updated_at = datetime.now(timezone.utc)

    def _mark_completed(self, job_id: str, result: Any) -> None:
        with self._lock:
            record = self._require_locked(job_id)
            record.status = JobStatus.COMPLETED
            record.result = result
            record.progress.percentage = 100.0
            record.updated_at = datetime.now(timezone.utc)

    def _mark_failed(self, job_id: str, error: str) -> None:
        with self._lock:
            record = self._require_locked(job_id)
            record.status = JobStatus.FAILED
            record.error = error
            record.updated_at = datetime.now(timezone.utc)

    def _require_locked(self, job_id: str) -> JobRecord:
        record = self._jobs.get(job_id)
        if record is None:
            raise JobNotFoundError(f"No job found with id '{job_id}'.")
        return record


job_manager = JobManager()