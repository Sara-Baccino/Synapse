"""
synapse_gui.services.job_manager
----------------------------------------

Thread-safe, in-memory job state manager for background execution via
FastAPI's BackgroundTasks. Deliberately generic (result: Any, no
dependency on AnalysisResult/StructureModule): any analysis module's
job could be run through this, keeping job_manager.py from being
coupled to a specific downstream package. Mirrors the in-memory-only,
no-Redis/Celery decision already made for job state (Phase 8, point 2).
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
    "JobStatus",
    "JobProgress",
    "JobRecord",
    "JobProgressReporter",
    "JobNotFoundError",
    "JobManager",
    "job_manager",
]


class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class JobProgress(BaseModel):
    """Coarse-grained progress state for a job.

    `percentage` is optional and stage-based (see module docstring):
    StructureModule has no internal progress hooks, so callers report
    progress only at the stage boundaries they themselves control
    (e.g. "preprocessing done", "clustering done"), not a true
    fine-grained percentage.
    """

    model_config = ConfigDict(extra="forbid")

    message: str = "Queued."
    percentage: float | None = Field(default=None, ge=0.0, le=100.0)
    logs: list[str] = Field(default_factory=list)


class JobRecord(BaseModel):
    """Full state of a single background job."""

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
    """Handed to a job's target callable so it can report progress
    without needing to know about JobManager's internal locking/storage.
    """

    def __init__(self, manager: "JobManager", job_id: str) -> None:
        self._manager = manager
        self._job_id = job_id

    def update(self, message: str, percentage: float | None = None) -> None:
        """Append a progress message (and optionally a stage percentage)."""
        self._manager._update_progress(self._job_id, message, percentage)


class JobManager:
    """Thread-safe in-memory registry of background job state.

    A threading.Lock guards all reads/writes: FastAPI's BackgroundTasks
    runs sync callables in a worker threadpool (not on the asyncio event
    loop), so job state is genuinely accessed from multiple threads
    concurrently -- an asyncio.Lock would not protect against that.
    """

    def __init__(self) -> None:
        self._jobs: dict[str, JobRecord] = {}
        self._lock = threading.Lock()

    def create_job(self) -> str:
        """Register a new job in PENDING state and return its job_id."""
        job_id = str(uuid4())
        record = JobRecord(job_id=job_id)
        with self._lock:
            self._jobs[job_id] = record
        return job_id

    def get_job(self, job_id: str) -> JobRecord:
        with self._lock:
            record = self._jobs.get(job_id)
        if record is None:
            raise JobNotFoundError(f"No job found with id '{job_id}'.")
        return record.model_copy(deep=True)

    def run_job(self, job_id: str, target: Callable[[JobProgressReporter], Any]) -> None:
        """Execute `target` for `job_id`, transitioning PENDING -> RUNNING ->
        COMPLETED/FAILED. Intended to be scheduled via
        `BackgroundTasks.add_task(job_manager.run_job, job_id, target)`.

        Any exception raised by `target` is caught here and turned into
        a FAILED job state (with the full traceback as the error
        message) -- an exception must never escape a background task,
        or the job would be stuck in RUNNING forever from the caller's
        point of view.
        """
        self._set_status(job_id, JobStatus.RUNNING)
        reporter = JobProgressReporter(self, job_id)

        try:
            result = target(reporter)
        except Exception:  # noqa: BLE001 - must never propagate out of a background task
            self._mark_failed(job_id, traceback.format_exc())
            return

        self._mark_completed(job_id, result)

    # ------------------------------------------------------------------ #
    # Internal state transitions (all lock-guarded)
    # ------------------------------------------------------------------ #
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
        """Must be called while holding self._lock."""
        record = self._jobs.get(job_id)
        if record is None:
            raise JobNotFoundError(f"No job found with id '{job_id}'.")
        return record


# Module-level singleton: same justification as dataset_store -- this
# object's entire purpose is shared mutable state across requests
# within a single server process.
job_manager = JobManager()