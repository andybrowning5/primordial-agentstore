"""Usage tracking API endpoints."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class UsageEventCreate(BaseModel):
    agent_name: str
    agent_version: str
    run_duration_seconds: float
    success: bool
    invocation_type: str = "direct"
    error_message: str | None = None


@router.post("")
async def record_usage(event: UsageEventCreate):
    """Record a usage event after an agent run."""
    return {"message": "Usage recorded", "event": event.model_dump()}


@router.get("/me")
async def my_usage():
    """Get my usage history."""
    return {"events": []}
