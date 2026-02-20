"""Agent Store configuration."""

from __future__ import annotations

import json
import re
from pathlib import Path

from platformdirs import user_data_dir, user_cache_dir


APP_NAME = "agentstore"


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

    @property
    def keys_file(self) -> Path:
        return self.data_dir / "keys.enc"

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

    @property
    def settings_file(self) -> Path:
        return self.data_dir / "settings.json"

    def _load_settings(self) -> dict:
        if self.settings_file.exists():
            return json.loads(self.settings_file.read_text())
        return {}

    def _save_settings(self, settings: dict) -> None:
        self.settings_file.write_text(json.dumps(settings, indent=2))

    def get_timezone(self) -> str | None:
        return self._load_settings().get("timezone")

    def set_timezone(self, tz: str) -> None:
        settings = self._load_settings()
        settings["timezone"] = tz
        self._save_settings(settings)

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


_config: AgentStoreConfig | None = None


def get_config() -> AgentStoreConfig:
    global _config
    if _config is None:
        _config = AgentStoreConfig()
    return _config
