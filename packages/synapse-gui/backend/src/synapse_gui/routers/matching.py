"""Placeholder — the new matching bridge, implemented in a following step."""

from __future__ import annotations
from fastapi import APIRouter

__all__ = ["router"]
router = APIRouter(prefix="/matching", tags=["matching"])


@router.get("/ping")
def ping() -> dict[str, str]:
    return {"router": "matching", "status": "ok"}