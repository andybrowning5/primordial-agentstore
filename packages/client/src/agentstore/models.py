"""Shared Pydantic models for Agent Store."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class AgentStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    DEPRECATED = "deprecated"
    SUSPENDED = "suspended"
    UNLISTED = "unlisted"


class ReviewStatus(str, Enum):
    PENDING = "pending"
    SCANNING = "scanning"
    TESTING = "testing"
    PENDING_HUMAN_REVIEW = "pending_human_review"
    APPROVED = "approved"
    REJECTED = "rejected"


class PermissionTier(int, Enum):
    AUTO_APPROVED = 1
    USER_APPROVED = 2
    HUMAN_REVIEWED = 3


class InvocationType(str, Enum):
    DIRECT = "direct"
    DELEGATED = "delegated"


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
    tier: int = 1


class FilesystemPermission(BaseModel):
    workspace: str = "readwrite"


class DelegationPermission(BaseModel):
    enabled: bool = False
    allowed_agents: list[str] = Field(default_factory=list)


class Permissions(BaseModel):
    network: list[NetworkPermission] = Field(default_factory=list)
    filesystem: FilesystemPermission = Field(default_factory=FilesystemPermission)
    delegation: DelegationPermission = Field(default_factory=DelegationPermission)


class IOSchema(BaseModel):
    format: str = "text"
    schema_def: Optional[dict[str, Any]] = Field(default=None, alias="schema")

    model_config = {"populate_by_name": True}


class AgentInterface(BaseModel):
    input: IOSchema = Field(default_factory=IOSchema)
    output: IOSchema = Field(default_factory=IOSchema)


class ToolDefinition(BaseModel):
    name: str
    description: str
    config: Optional[dict[str, Any]] = None


class TestCase(BaseModel):
    name: str
    input: dict[str, Any]
    expected_output_contains: Optional[list[str]] = None
    max_duration: int = 60


class AgentManifest(BaseModel):
    """Complete agent manifest parsed from agent.yaml."""

    name: str
    display_name: str
    version: str
    description: str
    long_description: Optional[str] = None
    category: str
    tags: list[str] = Field(default_factory=list)
    author: AuthorInfo
    runtime: RuntimeConfig
    system_prompt: str
    tools: list[ToolDefinition] = Field(default_factory=list)
    permissions: Permissions = Field(default_factory=Permissions)
    interface: AgentInterface = Field(default_factory=AgentInterface)
    tests: list[TestCase] = Field(default_factory=list)

    def compute_permission_tier(self) -> PermissionTier:
        max_tier = 1
        for net_perm in self.permissions.network:
            max_tier = max(max_tier, net_perm.tier)
        if self.permissions.delegation.enabled:
            max_tier = 3
        for tool in self.tools:
            if tool.name in ("docker", "network_wildcard"):
                max_tier = 3
            elif tool.name == "shell":
                max_tier = max(max_tier, 2)
        return PermissionTier(max_tier)


# === API Response Models ===


class AgentSummary(BaseModel):
    name: str
    display_name: str
    description: str
    category: str
    tags: list[str]
    author: AuthorInfo
    latest_version: str
    total_runs: int = 0
    avg_rating: Optional[float] = None
    status: AgentStatus


class AgentDetail(BaseModel):
    name: str
    display_name: str
    description: str
    long_description: Optional[str] = None
    category: str
    tags: list[str]
    author: AuthorInfo
    latest_version: str
    versions: list[str]
    total_runs: int = 0
    total_stars: int = 0
    avg_rating: Optional[float] = None
    status: AgentStatus
    permissions: Permissions
    runtime: RuntimeConfig
    created_at: datetime
    updated_at: datetime


class UsageEvent(BaseModel):
    agent_name: str
    agent_version: str
    run_duration_seconds: float
    success: bool
    invocation_type: InvocationType = InvocationType.DIRECT
    error_message: Optional[str] = None


class RunResult(BaseModel):
    status: str
    agent: str
    version: str
    run_id: str
    duration_seconds: float
    output: Any
    error: Optional[str] = None
