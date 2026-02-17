"""Leaderboard API endpoints."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Query

router = APIRouter()


@router.get("")
async def get_leaderboard(
    period: str = Query("month", description="Time period"),
    category: Optional[str] = Query(None, description="Filter by category"),
    limit: int = Query(20, ge=1, le=100),
):
    """Get top agents by usage."""
    return {"period": period, "agents": []}
