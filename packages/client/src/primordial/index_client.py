"""Client for the Primordial index ratings & telemetry API.

Implements the write side of the Phase-0 contract:
  POST {index_url}/events   — opt-in, anonymous run telemetry
  POST {index_url}/ratings  — gh-token-authenticated 1-5 ratings

No PII is ever sent. Telemetry carries only a random, locally-generated
client_id used for dedup/abuse-limiting, never identity.
"""

from __future__ import annotations

import logging
import os
import subprocess
from datetime import datetime, timezone
from typing import Optional

import httpx

from primordial.config import get_config

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _require_https(index_url: str) -> None:
    if not index_url.startswith("https://"):
        raise ValueError(f"Refusing non-HTTPS index URL: {index_url!r}")


def resolve_github_token() -> Optional[str]:
    """Resolve a GitHub token from GH_TOKEN/GITHUB_TOKEN or the gh CLI."""
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if token:
        return token.strip()
    try:
        result = subprocess.run(
            ["gh", "auth", "token"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except (FileNotFoundError, subprocess.SubprocessError):
        pass
    return None


def submit_rating(agent_id: str, stars: int, comment: Optional[str] = None) -> dict:
    """POST a rating to {index_url}/ratings.

    Resolves a GitHub token (GH_TOKEN/GITHUB_TOKEN or `gh auth token`). The
    index verifies the token against GitHub to resolve the rater's login and
    upserts one rating per (agent_id, gh_login).

    Raises ValueError on bad input or missing token; httpx.HTTPError on network
    failure.
    """
    if not (1 <= stars <= 5):
        raise ValueError("stars must be between 1 and 5")
    if comment and len(comment) > 500:
        raise ValueError("comment must be 500 characters or fewer")

    token = resolve_github_token()
    if not token:
        raise ValueError(
            "No GitHub token found. Authenticate with `gh auth login` or set "
            "GH_TOKEN to submit a rating."
        )

    config = get_config()
    index_url = config.index_url
    _require_https(index_url)

    payload = {"agent_id": agent_id, "stars": stars, "gh_token": token}
    if comment:
        payload["comment"] = comment

    resp = httpx.post(
        f"{index_url}/ratings",
        json=payload,
        timeout=15,
        follow_redirects=False,
    )
    resp.raise_for_status()
    try:
        return resp.json()
    except ValueError:
        return {"ok": True}


def send_event(
    agent_id: str,
    event: str,
    *,
    success: Optional[bool] = None,
    duration_ms: Optional[int] = None,
) -> bool:
    """POST a telemetry event to {index_url}/events when telemetry is enabled.

    event is "run_start" or "run_complete". success/duration_ms only apply to
    run_complete. Best-effort and fully silent on failure — telemetry must
    never disrupt an agent run. Returns True if a request was sent.
    """
    config = get_config()
    if not config.telemetry_enabled:
        return False

    index_url = config.index_url
    try:
        _require_https(index_url)
    except ValueError as e:
        logger.debug("Telemetry skipped: %s", e)
        return False

    payload = {
        "agent_id": agent_id,
        "event": event,
        "client_id": config.client_id,
        "ts": _now_iso(),
    }
    if event == "run_complete":
        if success is not None:
            payload["success"] = bool(success)
        if duration_ms is not None:
            payload["duration_ms"] = int(duration_ms)

    try:
        httpx.post(f"{index_url}/events", json=payload, timeout=5)
        return True
    except httpx.HTTPError as e:
        logger.debug("Telemetry send failed (ignored): %s", e)
        return False


def maybe_prompt_telemetry_opt_in() -> None:
    """Ask the user once whether to enable anonymous telemetry.

    No-op if already decided, or if not attached to an interactive TTY. Default
    is disabled — declining (or a non-interactive session) records 'disabled'
    so we never ask again.
    """
    import sys

    config = get_config()
    if config.telemetry_decided:
        return
    if not (sys.stdin.isatty() and sys.stdout.isatty()):
        # Don't block non-interactive runs; leave the decision unrecorded so a
        # later interactive run can still ask.
        return

    import click

    click.echo(
        "\nHelp improve Primordial? Share anonymous run telemetry "
        "(no PII, just a random id + success/duration). You can change this "
        "later in your config."
    )
    enabled = click.confirm("Enable anonymous telemetry?", default=False)
    config.set_telemetry_enabled(enabled)
    click.echo(f"Telemetry {'enabled' if enabled else 'disabled'}.\n")
