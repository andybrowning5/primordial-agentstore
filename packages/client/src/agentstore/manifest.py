"""Agent manifest parser - loads and validates agent.yaml files."""

from __future__ import annotations

import re
from pathlib import Path

import yaml

from agentstore.models import AgentManifest


def load_manifest(path: Path) -> AgentManifest:
    """Load and validate an agent manifest from a YAML file."""
    if path.is_dir():
        path = path / "agent.yaml"

    if not path.exists():
        raise FileNotFoundError(f"Agent manifest not found: {path}")

    with open(path) as f:
        raw = yaml.safe_load(f)

    if not isinstance(raw, dict):
        raise ValueError(f"Invalid manifest format in {path}: expected a YAML mapping")

    try:
        manifest = AgentManifest(**raw)
    except Exception as e:
        raise ValueError(f"Invalid agent manifest in {path}: {e}") from e

    _validate_manifest(manifest, path.parent)
    return manifest


def _validate_manifest(manifest: AgentManifest, agent_dir: Path) -> None:
    """Additional validation beyond Pydantic schema."""
    if not _is_valid_name(manifest.name):
        raise ValueError(
            f"Invalid agent name '{manifest.name}': must be 3-40 chars, "
            "lowercase letters, numbers, and hyphens only"
        )

    # Must have either entry_point (Python SDK) or run_command (generic)
    if not manifest.runtime.entry_point and not manifest.runtime.run_command:
        raise ValueError(
            "Runtime must specify either 'entry_point' (for Python SDK agents) "
            "or 'run_command' (for generic agents)"
        )

    if manifest.runtime.entry_point and ":" not in manifest.runtime.entry_point:
        raise ValueError(
            f"Invalid entry_point '{manifest.runtime.entry_point}': "
            "must be in format 'module.path:function_name'"
        )

    # If dependencies file is specified, it must exist
    if manifest.runtime.dependencies:
        deps_path = agent_dir / manifest.runtime.dependencies
        if not deps_path.exists():
            raise ValueError(f"Dependencies file not found: {deps_path}")


def _is_valid_name(name: str) -> bool:
    if len(name) < 3 or len(name) > 40:
        return False
    return bool(re.match(r"^[a-z][a-z0-9-]*[a-z0-9]$", name))
