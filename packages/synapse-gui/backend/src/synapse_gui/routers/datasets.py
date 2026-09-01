"""Placeholder — implemented in full in the next step (recycled from synclair-gui, plus import-config)."""

from __future__ import annotations
from fastapi import APIRouter

__all__ = ["router"]
router = APIRouter(prefix="/datasets", tags=["datasets"])


@router.get("/ping")
def ping() -> dict[str, str]:
    return {"router": "datasets", "status": "ok"}