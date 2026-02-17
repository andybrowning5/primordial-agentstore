"""Runtime monitoring and audit logging for agent execution."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class AuditLogger:
    """Logs agent runtime events for security auditing."""

    def __init__(self, log_dir: Path):
        self._log_dir = log_dir
        self._log_dir.mkdir(parents=True, exist_ok=True)

    def _log_file(self) -> Path:
        date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        return self._log_dir / f"{date}.jsonl"

    def log_event(
        self,
        run_id: str,
        agent_name: str,
        agent_version: str,
        event_type: str,
        details: dict[str, Any],
        allowed: bool = True,
    ) -> None:
        entry = {
            "run_id": run_id,
            "agent": agent_name,
            "version": agent_version,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "event_type": event_type,
            "details": details,
            "allowed": allowed,
        }
        with open(self._log_file(), "a") as f:
            f.write(json.dumps(entry) + "\n")

    def get_logs(
        self,
        agent_name: str | None = None,
        run_id: str | None = None,
        limit: int = 50,
    ) -> list[dict]:
        entries = []
        log_files = sorted(self._log_dir.glob("*.jsonl"), reverse=True)
        for log_file in log_files:
            with open(log_file) as f:
                for line in f:
                    entry = json.loads(line)
                    if agent_name and entry.get("agent") != agent_name:
                        continue
                    if run_id and entry.get("run_id") != run_id:
                        continue
                    entries.append(entry)
                    if len(entries) >= limit:
                        return entries
        return entries
