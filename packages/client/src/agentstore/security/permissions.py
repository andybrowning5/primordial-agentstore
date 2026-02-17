"""Permission display and user approval for agent capabilities."""

from __future__ import annotations

from agentstore.models import AgentManifest


def format_permissions_for_display(manifest: AgentManifest) -> list[str]:
    """Format agent permissions as human-readable lines for approval prompt."""
    lines = []

    session_dur = manifest.runtime.resources.max_session_duration
    lines.append(f"Session: up to {session_dur}s")
    lines.append("")

    if manifest.permissions.network:
        lines.append("Network access:")
        for net in manifest.permissions.network:
            lines.append(f"  - {net.domain}: {net.reason}")
    else:
        lines.append("Network access: None (sandbox isolated)")

    lines.append(f"Workspace access: {manifest.permissions.filesystem.workspace}")

    if manifest.permissions.delegation.enabled:
        lines.append("Agent delegation: ENABLED")
        for a in manifest.permissions.delegation.allowed_agents:
            lines.append(f"  - Can call: {a}")

    r = manifest.runtime.resources
    lines.append(f"Resources: {r.max_memory} RAM, {r.max_cpu} CPUs, {r.max_duration}s timeout")
    return lines
