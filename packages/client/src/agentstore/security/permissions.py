"""Permission checking and user approval for agent capabilities."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from agentstore.models import AgentManifest, PermissionTier


class PermissionManager:
    """Manages user-approved permissions for installed agents."""

    def __init__(self, agents_dir: Path):
        self._agents_dir = agents_dir

    def _permissions_file(self, agent_name: str) -> Path:
        return self._agents_dir / agent_name / "permissions.json"

    def get_approved_permissions(self, agent_name: str) -> Optional[dict]:
        pfile = self._permissions_file(agent_name)
        if pfile.exists():
            return json.loads(pfile.read_text())
        return None

    def save_approved_permissions(self, agent_name: str, manifest: AgentManifest) -> None:
        pfile = self._permissions_file(agent_name)
        pfile.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "version": manifest.version,
            "tier": manifest.compute_permission_tier().value,
            "permissions": manifest.permissions.model_dump(),
            "tools": [t.model_dump() for t in manifest.tools],
        }
        pfile.write_text(json.dumps(data, indent=2))

    def needs_approval(self, manifest: AgentManifest) -> bool:
        approved = self.get_approved_permissions(manifest.name)
        if approved is None:
            return True
        if approved["version"] != manifest.version:
            current_perms = manifest.permissions.model_dump()
            if current_perms != approved["permissions"]:
                return True
        return False

    def format_permissions_for_display(self, manifest: AgentManifest) -> list[str]:
        lines = []
        tier = manifest.compute_permission_tier()
        lines.append(f"Permission tier: {tier.name} (Tier {tier.value})")
        lines.append("")

        if manifest.permissions.network:
            lines.append("Network access:")
            for net in manifest.permissions.network:
                tier_label = f" [Tier {net.tier}]" if net.tier > 1 else ""
                lines.append(f"  - {net.domain}: {net.reason}{tier_label}")
        else:
            lines.append("Network access: None (sandbox isolated)")

        lines.append(f"Workspace access: {manifest.permissions.filesystem.workspace}")

        if manifest.tools:
            lines.append("Tools:")
            for tool in manifest.tools:
                lines.append(f"  - {tool.name}: {tool.description}")

        if manifest.permissions.delegation.enabled:
            lines.append("Agent delegation: ENABLED [Tier 3]")
            if manifest.permissions.delegation.allowed_agents:
                for a in manifest.permissions.delegation.allowed_agents:
                    lines.append(f"  - Can call: {a}")

        r = manifest.runtime.resources
        lines.append(f"Resources: {r.max_memory} RAM, {r.max_cpu} CPUs, {r.max_duration}s timeout")
        return lines
