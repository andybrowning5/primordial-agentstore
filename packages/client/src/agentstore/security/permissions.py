"""Permission display and user approval for agent capabilities."""

from __future__ import annotations

from agentstore.models import AgentManifest

from agentstore.config import get_config
from agentstore.security.key_vault import KeyVault


def format_permissions_for_display(manifest: AgentManifest) -> list[str]:
    """Format agent permissions as human-readable lines for approval prompt."""
    lines = []

    if manifest.permissions.network_unrestricted:
        lines.append("Network access: UNRESTRICTED (full internet)")
    elif manifest.permissions.network:
        lines.append("Network access:")
        for net in manifest.permissions.network:
            lines.append(f"  [bright_black]- {net.domain}: {net.reason}[/bright_black]")
    else:
        lines.append("Network access: None (sandbox isolated)")

    lines.append(f"Workspace access:")
    lines.append(f"  [bright_black]- {manifest.permissions.filesystem.workspace}[/bright_black]")

    if manifest.permissions.delegation.enabled:
        lines.append("Agent delegation: ENABLED")
        for a in manifest.permissions.delegation.allowed_agents:
            lines.append(f"  - Can call: {a}")

    if manifest.keys:
        lines.append("")
        lines.append("API keys:")
        config = get_config()
        vault = KeyVault(config.keys_file)
        for key_req in manifest.keys:
            label = "required" if key_req.required else "optional"
            env = key_req.resolved_env_var()
            stored = vault.get_key(key_req.provider)
            status = "[green]stored[/green]" if stored else "[red]missing[/red]"
            lines.append(f"  [bright_black]- {key_req.provider} ({env}): {label} — {status}[/bright_black]")

    r = manifest.runtime.resources
    lines.append("Resources:")
    lines.append(f"  [bright_black]- {r.max_memory} RAM[/bright_black]")
    lines.append(f"  [bright_black]- {r.max_cpu} CPUs[/bright_black]")
    return lines
