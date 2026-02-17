"""Base agent class for Agent Store agents."""

from __future__ import annotations

import glob as glob_module
import json as json_module
import os
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Optional

from agentstore_sdk.io import (
    receive_messages,
    send_activity,
    send_error,
    send_ready,
    send_response,
)


class _AgentBase(ABC):
    """Shared filesystem helpers for all agent types."""

    def read_file(self, path: str | Path) -> str:
        return Path(path).read_text()

    def write_file(self, path: str | Path, content: str) -> None:
        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content)

    def glob(self, directory: str | Path, pattern: str) -> list[str]:
        return sorted(glob_module.glob(str(Path(directory) / pattern), recursive=True))

    def get_env(self, key: str) -> Optional[str]:
        return os.environ.get(key)

    @property
    def state_dir(self) -> Path:
        """Directory for persistent state across runs."""
        path = Path(os.environ.get("AGENT_STATE_DIR", "/home/agent/state"))
        path.mkdir(parents=True, exist_ok=True)
        return path

    def save_state(self, key: str, data: Any) -> None:
        """Save data as JSON under a named key."""
        path = self.state_dir / f"{key}.json"
        path.write_text(json_module.dumps(data, indent=2))

    def load_state(self, key: str, default: Any = None) -> Any:
        """Load previously saved state. Returns default if not found."""
        path = self.state_dir / f"{key}.json"
        if not path.exists():
            return default
        return json_module.loads(path.read_text())

    def list_state_keys(self) -> list[str]:
        """List all saved state keys."""
        return [
            p.stem for p in self.state_dir.glob("*.json")
        ]

    def delete_state(self, key: str) -> None:
        """Delete a saved state key."""
        path = self.state_dir / f"{key}.json"
        if path.exists():
            path.unlink()


class Agent(_AgentBase):
    """Base class for Agent Store agents.

    Subclasses implement setup(), handle_message(), and teardown().
    The platform calls run_loop() which drives the NDJSON stdin/stdout
    protocol automatically.

    Example:
        class MyAgent(Agent):
            def setup(self) -> None:
                self.history = []

            def handle_message(self, content: str, message_id: str) -> None:
                self.history.append(content)
                self.send_response(f"You said: {content}", message_id)

            def teardown(self) -> None:
                pass
    """

    def setup(self) -> None:
        """Called once when the session starts. Override for initialization."""

    @abstractmethod
    def handle_message(self, content: str, message_id: str) -> None:
        """Handle a single user message. Must call send_response() at least once."""
        ...

    def teardown(self) -> None:
        """Called when the session ends. Override for cleanup."""

    # --- helpers that delegate to io module ---

    def send_response(self, content: str, message_id: str, done: bool = True) -> None:
        send_response(content, message_id, done)

    def send_activity(self, tool: str, description: str, message_id: str) -> None:
        send_activity(tool, description, message_id)

    def send_error(self, error: str, message_id: str) -> None:
        send_error(error, message_id)

    # --- main loop ---

    def run_loop(self) -> None:
        """Main event loop. Called by the platform bootstrap script."""
        try:
            self.setup()
            send_ready()
            for msg in receive_messages():
                msg_type = msg.get("type")
                if msg_type == "message":
                    content = msg.get("content", "")
                    message_id = msg.get("message_id", "unknown")
                    try:
                        self.handle_message(content, message_id)
                    except Exception as exc:
                        send_error(str(exc), message_id)
                elif msg_type == "shutdown":
                    break
        finally:
            self.teardown()


# Backwards compatibility alias
InteractiveAgent = Agent
