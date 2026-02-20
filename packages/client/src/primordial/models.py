"""Shared Pydantic models for Agent Store."""

from __future__ import annotations

import re
from typing import Optional

from pydantic import BaseModel, Field, field_validator


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


class RuntimeConfig(BaseModel):
    language: str = "python"
    dependencies: Optional[str] = None
    setup_command: Optional[str] = None
    run_command: Optional[str] = None
    e2b_template: str = "base"
    default_model: ModelConfig = Field(default_factory=ModelConfig)
    resources: ResourceLimits = Field(default_factory=ResourceLimits)

    @field_validator("e2b_template")
    @classmethod
    def validate_template(cls, v: str) -> str:
        if v not in ALLOWED_TEMPLATES:
            raise ValueError(
                f"Template {v!r} not allowed. Allowed: {ALLOWED_TEMPLATES}"
            )
        return v


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
    network_unrestricted: bool = False
    filesystem: FilesystemPermission = Field(default_factory=FilesystemPermission)
    delegation: DelegationPermission = Field(default_factory=DelegationPermission)


_ENV_VAR_RE = re.compile(r"^[A-Z][A-Z0-9_]*$")
# Requires at least one dot (no single-label hosts like "localhost"),
# must contain at least one letter (rejects IP literals like "169.254.169.254")
_DOMAIN_RE = re.compile(r"^[a-z0-9]([a-z0-9-]*\.)+[a-z0-9][a-z0-9-]*$")
_DOMAIN_HAS_LETTER = re.compile(r"[a-z]")
_PROVIDER_RE = re.compile(r"^[a-z][a-z0-9-]*$")

# Env var names that base_url_env must never clobber
_PROTECTED_ENV_VARS = {
    "PATH", "HOME", "USER", "SHELL", "LANG", "LC_ALL", "LC_CTYPE",
    "TERM", "TZ", "PYTHONPATH", "NODE_PATH", "LD_PRELOAD",
    "LD_LIBRARY_PATH", "DYLD_LIBRARY_PATH", "DYLD_INSERT_LIBRARIES",
    # Provider base URL env vars — prevent manifest from hijacking proxy routes
    "ANTHROPIC_BASE_URL", "OPENAI_BASE_URL", "GOOGLE_BASE_URL",
    "GROQ_BASE_URL", "MISTRAL_BASE_URL", "DEEPSEEK_BASE_URL",
    "BRAVE_BASE_URL",
}

# Only these templates are allowed for sandbox creation
ALLOWED_TEMPLATES = {"base"}


class KeyRequirement(BaseModel):
    """Declares an API key that an agent needs."""

    provider: str
    env_var: Optional[str] = None  # auto-derived as <PROVIDER>_API_KEY if omitted
    required: bool = True
    domain: Optional[str] = None        # API domain, e.g. "api.stripe.com"
    base_url_env: Optional[str] = None  # env var for base URL override
    auth_style: Optional[str] = None    # "bearer" or "x-api-key"

    @field_validator("provider")
    @classmethod
    def validate_provider(cls, v: str) -> str:
        if not _PROVIDER_RE.match(v):
            raise ValueError(f"Invalid provider name: {v!r} (lowercase letters, numbers, hyphens)")
        return v

    @field_validator("env_var")
    @classmethod
    def validate_env_var(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not _ENV_VAR_RE.match(v):
            raise ValueError(f"Invalid env_var: {v!r} (must match [A-Z][A-Z0-9_]*)")
        if v is not None and v in _PROTECTED_ENV_VARS:
            raise ValueError(f"env_var cannot use protected name: {v!r}")
        return v

    @field_validator("domain")
    @classmethod
    def validate_domain(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            if not _DOMAIN_RE.match(v):
                raise ValueError(f"Invalid domain: {v!r} (must be a valid FQDN with at least one dot)")
            if not _DOMAIN_HAS_LETTER.search(v):
                raise ValueError(f"Invalid domain: {v!r} (IP literals not allowed)")
        return v

    @field_validator("base_url_env")
    @classmethod
    def validate_base_url_env(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not _ENV_VAR_RE.match(v):
            raise ValueError(f"Invalid base_url_env: {v!r} (must match [A-Z][A-Z0-9_]*)")
        if v is not None and v in _PROTECTED_ENV_VARS:
            raise ValueError(f"base_url_env cannot use protected name: {v!r}")
        return v

    @field_validator("auth_style")
    @classmethod
    def validate_auth_style(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("bearer", "x-api-key"):
            raise ValueError(f"Invalid auth_style: {v!r} (must be 'bearer' or 'x-api-key')")
        return v

    def resolved_env_var(self) -> str:
        return self.env_var or f"{self.provider.upper().replace('-', '_')}_API_KEY"


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
    keys: list[KeyRequirement] = Field(default_factory=list)
