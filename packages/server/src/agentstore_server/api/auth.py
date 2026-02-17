"""Authentication API endpoints."""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter()


@router.post("/login/github")
async def login_github():
    """Initiate GitHub OAuth flow."""
    return {"message": "GitHub OAuth not yet implemented"}


@router.post("/login/google")
async def login_google():
    """Initiate Google OAuth flow."""
    return {"message": "Google OAuth not yet implemented"}


@router.post("/refresh")
async def refresh_token():
    """Refresh JWT token."""
    return {"message": "Token refresh not yet implemented"}
