"""Backend server configuration."""

from __future__ import annotations

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings


class ServerConfig(BaseSettings):
    database_url: str = Field(
        default="postgresql+asyncpg://agentstore:agentstore@localhost:5432/agentstore"
    )
    secret_key: str = Field(default="change-me-in-production")
    access_token_expire_minutes: int = 60 * 24

    github_client_id: str = ""
    github_client_secret: str = ""
    google_client_id: str = ""
    google_client_secret: str = ""

    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""

    agent_storage_path: Path = Field(default=Path("./storage/agents"))
    signing_private_key_path: Path = Field(default=Path("./keys/signing.key"))
    signing_public_key_path: Path = Field(default=Path("./keys/signing.pub"))

    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False
    cors_origins: list[str] = Field(default=["http://localhost:3000"])

    model_config = {"env_prefix": "", "env_file": ".env"}


def get_server_config() -> ServerConfig:
    return ServerConfig()
