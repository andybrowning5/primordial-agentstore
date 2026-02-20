"""Agent manifest parser - loads and validates agent.yaml files."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Optional

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

    if not manifest.runtime.run_command:
        raise ValueError("Runtime must specify 'run_command'")

    # If dependencies file is specified, it must exist
    if manifest.runtime.dependencies:
        deps_path = agent_dir / manifest.runtime.dependencies
        if not deps_path.exists():
            raise ValueError(f"Dependencies file not found: {deps_path}")


def _is_valid_name(name: str) -> bool:
    if len(name) < 3 or len(name) > 40:
        return False
    return bool(re.match(r"^[a-z][a-z0-9-]*[a-z0-9]$", name))


def resolve_agent_name(agent_path: str, agents_dir: Optional[Path] = None) -> str:
    """Resolve an agent path (local dir, GitHub URL, or bare name) to its manifest name.

    Tries to load the manifest to get the canonical name. Falls back to the raw input.
    """
    from agentstore.github import GitHubResolver, GitHubResolverError, is_github_url, parse_github_url

    if is_github_url(agent_path):
        try:
            github_ref = parse_github_url(agent_path)
            resolver = GitHubResolver()
            agent_dir = resolver.resolve(github_ref)
        except GitHubResolverError:
            return agent_path
    else:
        agent_dir = Path(agent_path)
        if not agent_dir.exists() and agents_dir:
            installed = agents_dir / agent_path
            if installed.exists():
                agent_dir = installed
            else:
                return agent_path

    try:
        manifest = load_manifest(agent_dir)
        return manifest.name
    except (FileNotFoundError, ValueError):
        return agent_path
