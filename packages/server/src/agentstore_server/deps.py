"""FastAPI dependency injection."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from agentstore_server.config import ServerConfig, get_server_config
from agentstore_server.db import get_db

DBSession = Annotated[AsyncSession, Depends(get_db)]
Config = Annotated[ServerConfig, Depends(get_server_config)]
