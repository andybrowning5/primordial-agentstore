"""Agent registry API endpoints."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel

router = APIRouter()


class AgentListResponse(BaseModel):
    agents: list[dict]
    total: int
    page: int
    per_page: int


@router.get("")
async def list_agents(
    q: Optional[str] = Query(None, description="Search query"),
    category: Optional[str] = Query(None, description="Filter by category"),
    sort: str = Query("popular", description="Sort order"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
) -> AgentListResponse:
    """List and search agents."""
    return AgentListResponse(agents=[], total=0, page=page, per_page=per_page)


@router.get("/{name}")
async def get_agent(name: str):
    """Get agent details."""
    return {"message": f"Agent '{name}' details not yet implemented"}


@router.get("/{name}/versions")
async def list_versions(name: str):
    """List all versions of an agent."""
    return {"versions": []}


@router.post("")
async def create_agent():
    """Create a new agent."""
    return {"message": "Agent creation not yet implemented"}


@router.post("/{name}/versions")
async def publish_version(name: str):
    """Publish a new version of an agent."""
    return {"message": "Version publishing not yet implemented"}
