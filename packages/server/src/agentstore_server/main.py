"""FastAPI application factory."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from agentstore_server.config import get_server_config
from agentstore_server.api import agents, auth, usage, leaderboard


@asynccontextmanager
async def lifespan(app: FastAPI):
    config = get_server_config()
    config.agent_storage_path.mkdir(parents=True, exist_ok=True)
    yield


def create_app() -> FastAPI:
    config = get_server_config()

    app = FastAPI(
        title="Agent Store API",
        description="Marketplace API for specialized TUI AI agents",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
    app.include_router(agents.router, prefix="/api/v1/agents", tags=["agents"])
    app.include_router(usage.router, prefix="/api/v1/usage", tags=["usage"])
    app.include_router(leaderboard.router, prefix="/api/v1/leaderboard", tags=["leaderboard"])

    @app.get("/health")
    async def health():
        return {"status": "ok", "version": "0.1.0"}

    return app


app = create_app()
