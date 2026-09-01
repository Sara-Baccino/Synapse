"""Placeholder — implemented in a following step (matching-specific toy datasets)."""

from __future__ import annotations
from fastapi import APIRouter

__all__ = ["router"]
router = APIRouter(prefix="/demo", tags=["demo"])


@router.get("/ping")
def ping() -> dict[str, str]:
    return {"router": "demo", "status": "ok"}