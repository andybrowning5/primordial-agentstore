"""Agent Store configuration management."""

from __future__ import annotations

import tomli_w
from pathlib import Path
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings
from platformdirs import user_config_dir, user_data_dir, user_cache_dir, user_log_dir


APP_NAME = "agentstore"


def get_config_dir() -> Path:
    path = Path(user_config_dir(APP_NAME))
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_data_dir() -> Path:
    path = Path(user_data_dir(APP_NAME))
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_cache_dir() -> Path:
    path = Path(user_cache_dir(APP_NAME))
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_log_dir() -> Path:
    path = Path(user_log_dir(APP_NAME))
    path.mkdir(parents=True, exist_ok=True)
    return path


class AgentStoreConfig(BaseSettings):
    """Global Agent Store configuration."""

    api_url: str = Field(default="https://api.agentstore.dev")
    default_model_provider: str = Field(default="anthropic")
    default_model: str = Field(default="claude-sonnet-4-5-20250929")

    config_dir: Path = Field(default_factory=get_config_dir)
    data_dir: Path = Field(default_factory=get_data_dir)
    cache_dir: Path = Field(default_factory=get_cache_dir)
    log_dir: Path = Field(default_factory=get_log_dir)

    sandbox_timeout: int = Field(default=300)
    sandbox_max_memory: str = Field(default="2GB")

    model_config = {"env_prefix": "AGENTSTORE_"}

    @property
    def config_file(self) -> Path:
        return self.config_dir / "config.toml"

    @property
    def keys_file(self) -> Path:
        return self.data_dir / "keys.enc"

    @property
    def auth_token_file(self) -> Path:
        return self.data_dir / "auth_token"

    @property
    def agents_dir(self) -> Path:
        path = self.data_dir / "agents"
        path.mkdir(parents=True, exist_ok=True)
        return path

    def save(self) -> None:
        data = {
            "api_url": self.api_url,
            "default_model_provider": self.default_model_provider,
            "default_model": self.default_model,
            "sandbox_timeout": self.sandbox_timeout,
            "sandbox_max_memory": self.sandbox_max_memory,
        }
        self.config_file.parent.mkdir(parents=True, exist_ok=True)
        with open(self.config_file, "wb") as f:
            tomli_w.dump(data, f)

    @classmethod
    def load(cls) -> AgentStoreConfig:
        config = cls()
        if config.config_file.exists():
            import tomllib

            with open(config.config_file, "rb") as f:
                data = tomllib.load(f)
            config = cls(**data)
        return config


_config: Optional[AgentStoreConfig] = None


def get_config() -> AgentStoreConfig:
    global _config
    if _config is None:
        _config = AgentStoreConfig.load()
    return _config
