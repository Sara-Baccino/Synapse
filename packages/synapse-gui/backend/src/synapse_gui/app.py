"""
synapse_gui.app
--------------------

FastAPI entry point for Synapse. Same structure as synclair-gui's
app.py (CORS, lifespan, router wiring) -- Synapse is a fully
independent fork, so this file has no runtime dependency on
synclair-gui, only on the renamed synapse_core/synapse_matching/
synapse_reporting packages via the routers it mounts.
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from synapse_gui.routers import auth, datasets, demo, matching

__all__ = ["app", "create_app"]

_DEFAULT_DEV_ORIGINS = "http://localhost:5174,http://127.0.0.1:5174"


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    yield


def _resolve_allowed_origins() -> list[str]:
    raw = os.environ.get("CORS_ALLOWED_ORIGINS", _DEFAULT_DEV_ORIGINS)
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


def create_app() -> FastAPI:
    application = FastAPI(
        title="Synapse API",
        description="Backend API for the Synapse population matching workspace.",
        version="0.1.0",
        lifespan=_lifespan,
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=_resolve_allowed_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    application.include_router(auth.router)
    application.include_router(datasets.router)
    application.include_router(matching.router)
    application.include_router(demo.router)

    @application.get("/health", tags=["health"])
    def health_check() -> dict[str, str]:
        return {"status": "ok"}

    return application


app = create_app()