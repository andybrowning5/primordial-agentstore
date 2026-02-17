"""Shared Pydantic models for Agent Store."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


# === Manifest Models ===


class AuthorInfo(BaseModel):
    name: str
    github: Optional[str] = None


class ModelConfig(BaseModel):
    provider: str = "anthropic"
    model: str = "claude-sonnet-4-5-20250929"


class ResourceLimits(BaseModel):
    max_memory: str = "2GB"
    max_cpu: int = 2
    max_duration: int = 300
    max_output_size: str = "10MB"
    max_session_duration: int = 3600


class RuntimeConfig(BaseModel):
    language: str = "python"
    python_version: str = ">=3.11"
    entry_point: str
    dependencies: str = "requirements.txt"
    default_model: ModelConfig = Field(default_factory=ModelConfig)
    resources: ResourceLimits = Field(default_factory=ResourceLimits)


class NetworkPermission(BaseModel):
    domain: str
    reason: str


class FilesystemPermission(BaseModel):
    workspace: str = "readwrite"


class DelegationPermission(BaseModel):
    enabled: bool = False
    allowed_agents: list[str] = Field(default_factory=list)


class Permissions(BaseModel):
    network: list[NetworkPermission] = Field(default_factory=list)
    filesystem: FilesystemPermission = Field(default_factory=FilesystemPermission)
    delegation: DelegationPermission = Field(default_factory=DelegationPermission)


class AgentManifest(BaseModel):
    """Complete agent manifest parsed from agent.yaml."""

    name: str
    display_name: str
    version: str
    description: str
    category: str = "general"
    tags: list[str] = Field(default_factory=list)
    author: AuthorInfo
    runtime: RuntimeConfig
    permissions: Permissions = Field(default_factory=Permissions)
