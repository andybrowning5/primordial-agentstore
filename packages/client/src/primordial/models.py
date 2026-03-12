"""Shared Pydantic models for Agent Store."""

from __future__ import annotations

import re
from typing import Optional

from pydantic import BaseModel, Field, field_validator, model_validator


# === Manifest Models ===


class AuthorInfo(BaseModel):
    name: str
    github: Optional[str] = None
    website: Optional[str] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("author.name must not be empty")
        if len(v) > 100:
            raise ValueError(
                f"author.name is too long ({len(v)} chars) — must be 100 characters or fewer"
            )
        return v

    @field_validator("website")
    @classmethod
    def validate_website(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("author.website must not be empty if provided")
        if not re.match(r"^https?://", v, re.IGNORECASE):
            raise ValueError(
                f"Invalid author.website: {v!r} — must be a full HTTP/HTTPS URL "
                f"(e.g. 'https://example.com')"
            )
        return v

    @field_validator("github")
    @classmethod
    def validate_github(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("author.github must not be empty if provided")
        # Accept full GitHub URLs or bare username/org handles
        if v.startswith(("https://github.com/", "http://github.com/", "github.com/")):
            # Normalize to bare handle
            handle = re.split(r"github\.com/", v, maxsplit=1)[-1].rstrip("/")
        else:
            handle = v.lstrip("@")
        if not re.match(r"^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$", handle):
            raise ValueError(
                f"Invalid author.github: {v!r} — must be a GitHub username or URL "
                f"(e.g. 'octocat' or 'https://github.com/octocat')"
            )
        return handle


class ResourceLimits(BaseModel):
    max_memory: str = "2GB"
    max_cpu: int = 2
    max_time: str = "30m"  # sandbox timeout, e.g. "30m", "2h", "6h"

    @field_validator("max_memory")
    @classmethod
    def validate_max_memory(cls, v: str) -> str:
        v = v.strip()
        if not re.match(r"^\d+(\.\d+)?\s*(MB|GB|TB)$", v, re.IGNORECASE):
            raise ValueError(
                f"Invalid max_memory: {v!r} — must be a number followed by MB, GB, or TB "
                f"(e.g. '512MB', '2GB')"
            )
        return v

    @field_validator("max_cpu")
    @classmethod
    def validate_max_cpu(cls, v: int) -> int:
        if v < 1 or v > 32:
            raise ValueError(
                f"Invalid max_cpu: {v} — must be between 1 and 32"
            )
        return v

    @field_validator("max_time")
    @classmethod
    def validate_max_time(cls, v: str) -> str:
        v = v.strip()
        if not re.match(r"^\d+(\.\d+)?\s*(s|m|h)$", v, re.IGNORECASE):
            raise ValueError(
                f"Invalid max_time: {v!r} — must be a number followed by s, m, or h "
                f"(e.g. '30m', '2h', '3600s')"
            )
        return v


class RuntimeConfig(BaseModel):
    language: str = "python"
    dependencies: Optional[str] = None
    setup_command: Optional[str] = None
    run_command: Optional[str] = None
    mode: str = "agent"
    default_provider: str = "anthropic"
    resources: ResourceLimits = Field(default_factory=ResourceLimits)

    @field_validator("language")
    @classmethod
    def validate_language(cls, v: str) -> str:
        v = v.strip().lower()
        if not v:
            raise ValueError("runtime.language must not be empty")
        _VALID_LANGUAGES = {
            "python", "node", "javascript", "typescript", "ruby",
            "go", "rust", "java", "bash", "sh",
        }
        if v not in _VALID_LANGUAGES:
            suggestion = ", ".join(sorted(_VALID_LANGUAGES))
            raise ValueError(
                f"Invalid runtime.language: {v!r} — must be one of: {suggestion}"
            )
        return v

    @field_validator("mode")
    @classmethod
    def validate_mode(cls, v: str) -> str:
        v = v.strip().lower()
        _VALID_MODES = {"agent"}
        if v not in _VALID_MODES:
            suggestion = ", ".join(sorted(_VALID_MODES))
            raise ValueError(
                f"Invalid runtime.mode: {v!r} — must be one of: {suggestion}"
            )
        return v

    @field_validator("run_command")
    @classmethod
    def validate_run_command(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("runtime.run_command must not be empty if provided")
        return v

    @field_validator("setup_command")
    @classmethod
    def validate_setup_command(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("runtime.setup_command must not be empty if provided")
        return v


class NetworkPermission(BaseModel):
    domain: str
    reason: str

    @field_validator("domain")
    @classmethod
    def validate_domain(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("network permission domain must not be empty")
        if not _DOMAIN_RE.match(v):
            raise ValueError(
                f"Invalid network permission domain: {v!r} — must be a fully qualified domain name "
                f"(e.g. 'api.example.com'). No IP addresses or single-label hosts."
            )
        if not _DOMAIN_HAS_LETTER.search(v):
            raise ValueError(f"Invalid network permission domain: {v!r} — IP addresses are not allowed")
        return v

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("network permission reason must not be empty")
        if len(v) > 200:
            raise ValueError(
                f"network permission reason is too long ({len(v)} chars) — must be 200 characters or fewer"
            )
        return v


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
_DOMAIN_RE = re.compile(r"^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")
_DOMAIN_HAS_LETTER = re.compile(r"[a-z]")
_PROVIDER_RE = re.compile(r"^[a-z][a-z0-9-]*$")
_VALID_AUTH_STYLES = {"bearer", "x-api-key", "x-subscription-token"}

# Env var names that base_url_env must never clobber
_PROTECTED_ENV_VARS = {
    "PATH", "HOME", "USER", "SHELL", "LANG", "LC_ALL", "LC_CTYPE",
    "TERM", "TZ", "PYTHONPATH", "NODE_PATH", "LD_PRELOAD",
    "LD_LIBRARY_PATH", "DYLD_LIBRARY_PATH", "DYLD_INSERT_LIBRARIES",
    "WORKSPACE", "E2B_API_KEY",
}


class KeyRequirement(BaseModel):
    """Declares an API key that an agent needs."""

    provider: str
    env_var: Optional[str] = None  # auto-derived as <PROVIDER>_API_KEY if omitted
    required: bool = True
    domain: str = ""                     # API domain, e.g. "api.anthropic.com"
    auth_style: str = "bearer"           # "bearer" or "x-api-key"
    base_url_env: Optional[str] = None   # env var for base URL override

    @field_validator("provider")
    @classmethod
    def validate_provider(cls, v: str) -> str:
        if not _PROVIDER_RE.match(v):
            suggestion = v.lower().replace("_", "-").replace(" ", "-")
            hint = f" — try: {suggestion!r}" if suggestion != v else ""
            raise ValueError(f"Invalid provider name: {v!r} (must be lowercase letters, numbers, hyphens){hint}")
        return v

    @field_validator("env_var")
    @classmethod
    def validate_env_var(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not _ENV_VAR_RE.match(v):
            suggestion = v.upper().replace("-", "_").replace(" ", "_")
            raise ValueError(f"Invalid env_var: {v!r} — try: {suggestion!r} (must be UPPER_SNAKE_CASE)")
        if v is not None and v in _PROTECTED_ENV_VARS:
            raise ValueError(f"env_var {v!r} is a protected system variable — choose a different name")
        return v

    @field_validator("domain")
    @classmethod
    def validate_domain(cls, v: str) -> str:
        if not v:
            raise ValueError("domain is required — specify the upstream API host (e.g. 'api.example.com')")
        if not _DOMAIN_RE.match(v):
            raise ValueError(
                f"Invalid domain: {v!r} — must be a fully qualified domain name "
                f"(e.g. 'api.example.com'). No IP addresses or single-label hosts."
            )
        if not _DOMAIN_HAS_LETTER.search(v):
            raise ValueError(f"Invalid domain: {v!r} — IP addresses are not allowed, use a domain name instead")
        return v

    @field_validator("base_url_env")
    @classmethod
    def validate_base_url_env(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not _ENV_VAR_RE.match(v):
            suggestion = v.upper().replace("-", "_").replace(" ", "_")
            raise ValueError(f"Invalid base_url_env: {v!r} — try: {suggestion!r} (must be UPPER_SNAKE_CASE)")
        if v is not None and v in _PROTECTED_ENV_VARS:
            raise ValueError(f"base_url_env {v!r} is a protected system variable — choose a different name")
        return v

    @field_validator("auth_style")
    @classmethod
    def validate_auth_style(cls, v: str) -> str:
        v = v.lower()
        if v not in _VALID_AUTH_STYLES:
            allowed = ", ".join(sorted(_VALID_AUTH_STYLES))
            raise ValueError(
                f"Invalid auth_style: {v!r} — must be one of: {allowed}"
            )
        return v

    def resolved_env_var(self) -> str:
        return self.env_var or f"{self.provider.upper().replace('-', '_')}_API_KEY"


class AgentManifest(BaseModel):
    """Complete agent manifest parsed from agent.yaml."""

    name: str
    display_name: str
    version: str
    description: str

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("display_name must not be empty")
        if len(v) > 80:
            raise ValueError(
                f"display_name is too long ({len(v)} chars) — must be 80 characters or fewer"
            )
        if not re.search(r"[a-zA-Z]", v):
            raise ValueError(
                f"display_name must contain at least one letter: {v!r}"
            )
        return v

    @field_validator("description")
    @classmethod
    def validate_description(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("description must not be empty")
        if len(v) > 500:
            raise ValueError(
                f"description is too long ({len(v)} chars) — must be 500 characters or fewer"
            )
        return v

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        if len(v) < 3 or len(v) > 40:
            raise ValueError(
                f"Invalid name: {v!r} — must be 3-40 characters long"
            )
        if not re.match(r"^[a-z][a-z0-9-]*[a-z0-9]$", v):
            suggestion = re.sub(r"[^a-z0-9-]", "-", v.lower()).strip("-")
            hint = f" — try: {suggestion!r}" if suggestion != v else ""
            raise ValueError(
                f"Invalid name: {v!r} — must be lowercase letters, numbers, and hyphens only"
                f", starting and ending with a letter or number{hint}"
            )
        return v

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, v: list) -> list:
        if len(v) > 20:
            raise ValueError(
                f"Too many tags ({len(v)}) — must be 20 or fewer"
            )
        for tag in v:
            if not isinstance(tag, str) or not tag.strip():
                raise ValueError("Each tag must be a non-empty string")
            if len(tag) > 40:
                raise ValueError(
                    f"Tag {tag!r} is too long ({len(tag)} chars) — must be 40 characters or fewer"
                )
        return [t.strip() for t in v]

    @field_validator("version")
    @classmethod
    def validate_version(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("version must not be empty")
        if not re.match(r"^\d+\.\d+\.\d+([.+-].+)?$", v):
            raise ValueError(
                f"Invalid version: {v!r} — must follow semantic versioning (e.g. '1.0.0')"
            )
        parts = v.split(".", 2)
        try:
            major, minor = int(parts[0]), int(parts[1])
        except (ValueError, IndexError):
            raise ValueError(f"Invalid version: {v!r} — major and minor must be integers")
        if major < 0 or minor < 0:
            raise ValueError(f"Invalid version: {v!r} — version numbers must be non-negative")
        return v

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str) -> str:
        v = v.strip().lower()
        if not v:
            raise ValueError("category must not be empty")
        _VALID_CATEGORIES = {
            "general", "coding", "data", "writing", "research",
            "devops", "security", "finance", "science", "productivity",
        }
        if v not in _VALID_CATEGORIES:
            suggestion = ", ".join(sorted(_VALID_CATEGORIES))
            raise ValueError(
                f"Invalid category: {v!r} — must be one of: {suggestion}"
            )
        return v
    @model_validator(mode="after")
    def validate_no_duplicate_key_env_vars(self) -> "AgentManifest":
        seen_env_vars: set[str] = set()
        seen_base_url_envs: set[str] = set()
        for key_req in self.keys:
            env_var = key_req.resolved_env_var()
            if env_var in seen_env_vars:
                raise ValueError(
                    f"Duplicate env_var {env_var!r} across keys — each key must use a unique environment variable"
                )
            seen_env_vars.add(env_var)
            if key_req.base_url_env:
                if key_req.base_url_env in seen_base_url_envs:
                    raise ValueError(
                        f"Duplicate base_url_env {key_req.base_url_env!r} across keys — each key must use a unique base URL variable"
                    )
                seen_base_url_envs.add(key_req.base_url_env)
        return self

    category: str = "general"
    tags: list[str] = Field(default_factory=list)
    author: AuthorInfo
    runtime: RuntimeConfig
    permissions: Permissions = Field(default_factory=Permissions)
    keys: list[KeyRequirement] = Field(default_factory=list)
