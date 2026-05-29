"""Primordial AgentStore configuration."""

from __future__ import annotations

import json
import os
import re
import uuid
from pathlib import Path

from platformdirs import user_data_dir, user_cache_dir


APP_NAME = "primordial"

DEFAULT_INDEX_URL = "https://primordial-index.andybrowning5.workers.dev"
# Catalog cache time-to-live, in seconds (6 hours per the index contract).
CATALOG_TTL_SECONDS = 6 * 3600


def get_data_dir() -> Path:
    path = Path(user_data_dir(APP_NAME))
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_cache_dir() -> Path:
    path = Path(user_cache_dir(APP_NAME))
    path.mkdir(parents=True, exist_ok=True)
    return path


class AgentStoreConfig:
    """Global Agent Store configuration."""

    def __init__(self):
        self.data_dir = get_data_dir()
        self.cache_dir = get_cache_dir()
        self.sandbox_timeout = 300
        self.sandbox_max_memory = "2GB"
        self._settings: dict | None = None

    @property
    def keys_file(self) -> Path:
        return self.data_dir / "keys.enc"

    # --- persistent settings (config.json) ---------------------------------

    @property
    def settings_file(self) -> Path:
        return self.data_dir / "config.json"

    def _load_settings(self) -> dict:
        if self._settings is None:
            try:
                self._settings = json.loads(self.settings_file.read_text())
            except (FileNotFoundError, ValueError):
                self._settings = {}
        return self._settings

    def _save_settings(self) -> None:
        if self._settings is None:
            return
        self.settings_file.write_text(json.dumps(self._settings, indent=2))

    def get_setting(self, key: str, default=None):
        return self._load_settings().get(key, default)

    def set_setting(self, key: str, value) -> None:
        self._load_settings()[key] = value
        self._save_settings()

    @property
    def index_url(self) -> str:
        """Base URL of the Primordial index/ratings API.

        Resolution order: PRIMORDIAL_INDEX_URL env > config.json > default.
        Must be HTTPS (the default and any override) for security.
        """
        url = (
            os.environ.get("PRIMORDIAL_INDEX_URL")
            or self.get_setting("index_url")
            or DEFAULT_INDEX_URL
        )
        return url.rstrip("/")

    @property
    def catalog_cache_file(self) -> Path:
        return self.cache_dir / "catalog.json"

    @property
    def telemetry_enabled(self) -> bool:
        return bool(self.get_setting("telemetry", {}).get("enabled", False))

    def set_telemetry_enabled(self, enabled: bool) -> None:
        telemetry = self.get_setting("telemetry", {}) or {}
        telemetry["enabled"] = bool(enabled)
        self.set_setting("telemetry", telemetry)

    @property
    def telemetry_decided(self) -> bool:
        """True once the user has been asked about telemetry at least once."""
        return "enabled" in (self.get_setting("telemetry", {}) or {})

    @property
    def client_id(self) -> str:
        """Anonymous, randomly-generated client id for telemetry dedup.

        Generated once and persisted. Contains no PII — a random UUID only.
        """
        cid = self.get_setting("client_id")
        if not cid:
            cid = uuid.uuid4().hex
            self.set_setting("client_id", cid)
        return cid

    @property
    def agents_dir(self) -> Path:
        path = self.data_dir / "agents"
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def state_dir(self) -> Path:
        path = self.data_dir / "state"
        path.mkdir(parents=True, exist_ok=True)
        return path

    def _sanitize_name(self, name: str) -> str:
        safe = re.sub(r"[^a-zA-Z0-9_-]", "_", name)
        return safe if safe and safe not in (".", "..") else "_invalid_"

    def agent_state_dir(self, agent_name: str) -> Path:
        """Per-agent state root directory."""
        path = self.state_dir / self._sanitize_name(agent_name)
        path.mkdir(parents=True, exist_ok=True)
        return path

    def session_state_dir(self, agent_name: str, session_name: str) -> Path:
        """Per-session state directory within an agent."""
        path = self.agent_state_dir(agent_name) / self._sanitize_name(session_name)
        path.mkdir(parents=True, exist_ok=True)
        return path

    def list_sessions(self, agent_name: str) -> list[str]:
        """List existing session names for an agent."""
        agent_dir = self.agent_state_dir(agent_name)
        return sorted(
            [d.name for d in agent_dir.iterdir() if d.is_dir()],
            key=lambda n: (agent_dir / n).stat().st_mtime,
            reverse=True,
        )

    def delete_session(self, agent_name: str, session_name: str) -> bool:
        """Delete a session's state directory. Returns True if it existed."""
        import shutil
        path = self.agent_state_dir(agent_name) / self._sanitize_name(session_name)
        if path.exists() and path.is_dir():
            shutil.rmtree(path)
            return True
        return False

    @property
    def repos_cache_dir(self) -> Path:
        path = self.cache_dir / "repos"
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def patches_dir(self) -> Path:
        """Directory where workspace patches are saved after agent shutdown."""
        path = self.data_dir / "patches"
        path.mkdir(parents=True, exist_ok=True)
        return path


_config: AgentStoreConfig | None = None


def get_config() -> AgentStoreConfig:
    global _config
    if _config is None:
        _config = AgentStoreConfig()
    return _config
