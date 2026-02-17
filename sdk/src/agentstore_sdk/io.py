"""Structured I/O helpers for agent communication."""

from __future__ import annotations

import json
import sys
from typing import Any


def read_input() -> dict[str, Any]:
    """Read structured input from stdin (used by platform)."""
    if not sys.stdin.isatty():
        raw = sys.stdin.read()
        if raw.strip():
            return json.loads(raw)
    return {}


def write_output(data: dict[str, Any]) -> None:
    """Write structured output to stdout (consumed by platform)."""
    print("__AGENT_OUTPUT__")
    print(json.dumps(data))


def write_error(error: str) -> None:
    """Write error output to stdout (consumed by platform)."""
    print("__AGENT_ERROR__")
    print(json.dumps({"error": error}))
