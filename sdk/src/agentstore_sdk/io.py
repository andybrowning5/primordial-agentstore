"""NDJSON I/O helpers for agent communication."""

from __future__ import annotations

import json
import sys
from typing import Any, Generator


def send_response(content: str, message_id: str, done: bool = True) -> None:
    """Send a response message to the platform."""
    _send({"type": "response", "content": content, "message_id": message_id, "done": done})


def send_activity(tool: str, description: str, message_id: str) -> None:
    """Send an activity/tool-use notification to the platform."""
    _send({"type": "activity", "tool": tool, "description": description, "message_id": message_id})


def send_error(error: str, message_id: str) -> None:
    """Send an error message to the platform."""
    _send({"type": "error", "error": error, "message_id": message_id})


def send_ready() -> None:
    """Signal that the agent is ready to receive messages."""
    _send({"type": "ready"})


def receive_messages() -> Generator[dict[str, Any], None, None]:
    """Yield incoming messages from stdin (NDJSON lines).

    Yields dicts with at minimum a "type" key. Stops on EOF or a
    {"type": "shutdown"} message.
    """
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue
        yield msg
        if msg.get("type") == "shutdown":
            return


def _send(msg: dict[str, Any]) -> None:
    """Write a single NDJSON line to stdout and flush."""
    sys.stdout.write(json.dumps(msg) + "\n")
    sys.stdout.flush()
