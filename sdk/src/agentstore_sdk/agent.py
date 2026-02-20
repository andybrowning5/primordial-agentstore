"""Base agent class for Agent Store agents."""

from __future__ import annotations

import os
from abc import ABC, abstractmethod
from pathlib import Path

from agentstore_sdk.io import (
    receive_messages,
    send_activity,
    send_error,
    send_ready,
    send_response,
)


class Agent(ABC):
    """Base class for Agent Store agents.

    Subclasses implement setup(), handle_message(), and teardown().
    The platform calls run_loop() which drives the NDJSON stdin/stdout
    protocol automatically.

    Your agent's filesystem at /home/user/ is persisted between sessions.
    Write files, databases, or anything else — it'll be there next time.
    """

    @property
    def state_dir(self) -> Path:
        """Persistent directory that survives across sessions (/home/user/state/)."""
        path = Path(os.environ.get("AGENT_STATE_DIR", "/home/user/state"))
        path.mkdir(parents=True, exist_ok=True)
        return path

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
                    except BaseException as exc:
                        send_error(str(exc), message_id)
                elif msg_type == "shutdown":
                    break
        finally:
            self.teardown()


# Backwards compatibility alias
InteractiveAgent = Agent
