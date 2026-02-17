"""GitHub repository resolver for running agents from remote repos."""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from agentstore.config import get_config


class GitHubResolverError(Exception):
    pass


@dataclass
class GitHubRef:
    """Parsed GitHub repository reference."""

    owner: str
    repo: str
    ref: Optional[str] = None
    subdirectory: Optional[str] = None

    @property
    def cache_key(self) -> str:
        base = f"{self.owner}/{self.repo}"
        if self.ref:
            base += f"@{self.ref}"
        return hashlib.sha256(base.encode()).hexdigest()[:16] + f"-{self.repo}"

    @property
    def clone_url(self) -> str:
        return f"https://github.com/{self.owner}/{self.repo}.git"

    def __str__(self) -> str:
        s = f"github.com/{self.owner}/{self.repo}"
        if self.ref:
            s += f"@{self.ref}"
        if self.subdirectory:
            s += f" (subdir: {self.subdirectory})"
        return s


_GITHUB_PATTERNS = [
    # https://github.com/owner/repo...
    re.compile(r"^https?://github\.com/"),
    # github.com/owner/repo
    re.compile(r"^github\.com/"),
    # github:owner/repo
    re.compile(r"^github:"),
]


def is_github_url(value: str) -> bool:
    """Check if a string looks like a GitHub URL."""
    return any(p.search(value) for p in _GITHUB_PATTERNS)


def parse_github_url(url: str, ref_override: Optional[str] = None) -> GitHubRef:
    """Parse a GitHub URL into components.

    Supported formats:
        https://github.com/owner/repo
        https://github.com/owner/repo@ref
        https://github.com/owner/repo/tree/branch
        https://github.com/owner/repo/tree/branch/subdir
        github.com/owner/repo
        github.com/owner/repo@ref
        github:owner/repo
        github:owner/repo@ref
    """
    original = url

    # Normalize: strip trailing slashes and .git suffix
    url = url.rstrip("/")
    if url.endswith(".git"):
        url = url[:-4]

    # Handle github:owner/repo shorthand
    if url.startswith("github:"):
        url = "https://github.com/" + url[7:]

    # Handle github.com/owner/repo (no scheme)
    if url.startswith("github.com/"):
        url = "https://" + url

    # Extract @ref from end if present (before path parsing)
    ref = None
    if "@" in url.split("github.com/")[-1]:
        base, ref = url.rsplit("@", 1)
        url = base

    # Parse the path: /owner/repo[/tree/branch[/subdir]]
    match = re.match(
        r"^https?://github\.com/([a-zA-Z0-9_.-]+)/([a-zA-Z0-9_.-]+)(?:/tree/([^/]+)(?:/(.+))?)?$",
        url,
    )
    if not match:
        raise GitHubResolverError(f"Cannot parse GitHub URL: {original}")

    owner = match.group(1)
    repo = match.group(2)
    tree_ref = match.group(3)
    subdirectory = match.group(4)

    # tree_ref takes precedence if present (from /tree/branch/... URL)
    if tree_ref:
        ref = tree_ref

    # CLI --ref flag overrides everything
    if ref_override:
        ref = ref_override

    return GitHubRef(
        owner=owner,
        repo=repo,
        ref=ref,
        subdirectory=subdirectory,
    )


_SEMVER_TAG = re.compile(r"^v?\d+\.\d+")


def _inject_known_agent(repo_id: str, cache_path: Path) -> bool:
    """Inject bundled agent.yaml + bridge for known third-party agents.

    Returns True if a wrapper was injected.
    """
    wrappers_dir = Path(__file__).parent / "wrappers"
    # Map repo identifiers to wrapper directories
    wrapper_map = {
        "openclaw/openclaw": "openclaw",
    }
    wrapper_name = wrapper_map.get(repo_id)
    if not wrapper_name:
        return False

    wrapper_dir = wrappers_dir / wrapper_name
    if not wrapper_dir.exists():
        return False

    # Copy all wrapper files into the cloned repo
    for f in wrapper_dir.iterdir():
        if f.is_file():
            shutil.copy2(f, cache_path / f.name)

    return (cache_path / "agent.yaml").exists()


class GitHubResolver:
    """Resolves GitHub repos to local cached directories."""

    META_FILE = "_agentstore_meta.json"

    def __init__(self, cache_dir: Optional[Path] = None):
        config = get_config()
        self._cache_dir = cache_dir or (config.cache_dir / "repos")
        self._cache_dir.mkdir(parents=True, exist_ok=True)

    def resolve(
        self,
        github_ref: GitHubRef,
        force_refresh: bool = False,
        stale_after_seconds: int = 3600,
    ) -> Path:
        """Resolve a GitHub ref to a local directory containing agent.yaml.

        Clones if not cached. Refreshes if stale (default: 1 hour).
        Tags (semver-like refs) are never considered stale.
        """
        self._check_git()

        cache_path = self._cache_dir / github_ref.cache_key

        if force_refresh and cache_path.exists():
            shutil.rmtree(cache_path)

        if cache_path.exists() and self._has_metadata(cache_path):
            # Check staleness (skip for tags)
            is_tag = github_ref.ref and _SEMVER_TAG.match(github_ref.ref)
            if not is_tag and self._is_stale(cache_path, stale_after_seconds):
                self._refresh(github_ref, cache_path)
            else:
                age = self._get_cache_age(cache_path)
                if age is not None:
                    self._log(f"Using cached repo (fetched {self._format_age(age)} ago)")
        else:
            self._log(f"Cloning from GitHub...")
            self._clone(github_ref, cache_path)

        return self._find_agent_dir(cache_path, github_ref.subdirectory)

    def clear_cache(self, github_ref: Optional[GitHubRef] = None) -> int:
        """Clear cached repos. Returns number of entries cleared."""
        if github_ref:
            target = self._cache_dir / github_ref.cache_key
            if target.exists():
                shutil.rmtree(target)
                return 1
            return 0

        count = 0
        for entry in self._cache_dir.iterdir():
            if entry.is_dir() and (entry / self.META_FILE).exists():
                shutil.rmtree(entry)
                count += 1
        return count

    def list_cached(self) -> list[dict]:
        """List all cached repos with metadata."""
        entries = []
        for entry in sorted(self._cache_dir.iterdir()):
            meta_path = entry / self.META_FILE
            if entry.is_dir() and meta_path.exists():
                meta = json.loads(meta_path.read_text())
                age = time.time() - meta.get("cloned_at", 0)
                meta["age_seconds"] = round(age)
                meta["path"] = str(entry)
                entries.append(meta)
        return entries

    # --- internal ---

    @staticmethod
    def _log(msg: str) -> None:
        """Print a status message. Imported lazily to avoid circular deps."""
        print(f"  {msg}")

    def _get_cache_age(self, cache_path: Path) -> float | None:
        meta_path = cache_path / self.META_FILE
        if not meta_path.exists():
            return None
        meta = json.loads(meta_path.read_text())
        return time.time() - meta.get("cloned_at", 0)

    @staticmethod
    def _format_age(seconds: float) -> str:
        if seconds < 60:
            return f"{int(seconds)}s"
        if seconds < 3600:
            return f"{int(seconds / 60)}m"
        hours = seconds / 3600
        if hours < 24:
            return f"{hours:.1f}h"
        return f"{hours / 24:.1f}d"

    def _check_git(self) -> None:
        try:
            subprocess.run(
                ["git", "--version"], capture_output=True, text=True, timeout=5
            )
        except FileNotFoundError:
            raise GitHubResolverError(
                "git is not installed. Install git to run agents from GitHub URLs."
            )

    def _has_metadata(self, cache_path: Path) -> bool:
        return (cache_path / self.META_FILE).exists()

    def _is_stale(self, cache_path: Path, max_age: int) -> bool:
        meta_path = cache_path / self.META_FILE
        if not meta_path.exists():
            return True
        meta = json.loads(meta_path.read_text())
        return (time.time() - meta.get("cloned_at", 0)) > max_age

    def _clone(self, github_ref: GitHubRef, target: Path) -> None:
        if target.exists():
            shutil.rmtree(target)

        cmd = ["git", "clone", "--depth", "1"]
        if github_ref.ref:
            cmd.extend(["--branch", github_ref.ref])
        cmd.extend([github_ref.clone_url, str(target)])

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            # Clean up partial clone
            if target.exists():
                shutil.rmtree(target)
            stderr = result.stderr.strip()
            stderr_lower = stderr.lower()
            # Branch-specific check must come before generic "not found"
            if "not found" in stderr_lower and ("branch" in stderr_lower or "remote ref" in stderr_lower):
                raise GitHubResolverError(
                    f"Branch/tag '{github_ref.ref}' not found in {github_ref.owner}/{github_ref.repo}"
                )
            if "not found" in stderr_lower or "404" in stderr:
                raise GitHubResolverError(
                    f"Repository not found: {github_ref.clone_url}"
                )
            raise GitHubResolverError(f"git clone failed: {stderr[:300]}")

        self._write_metadata(github_ref, target)

    def _refresh(self, github_ref: GitHubRef, cache_path: Path) -> None:
        """Update an existing clone by fetching latest."""
        ref = github_ref.ref or "HEAD"
        fetch_cmd = ["git", "-C", str(cache_path), "fetch", "--depth", "1", "origin", ref]
        result = subprocess.run(fetch_cmd, capture_output=True, text=True, timeout=60)
        if result.returncode != 0:
            # Fetch failed — fall back to full re-clone
            self._clone(github_ref, cache_path)
            return

        reset_cmd = ["git", "-C", str(cache_path), "reset", "--hard", "FETCH_HEAD"]
        subprocess.run(reset_cmd, capture_output=True, text=True, timeout=30)
        self._write_metadata(github_ref, cache_path)

    def _write_metadata(self, github_ref: GitHubRef, cache_path: Path) -> None:
        meta = {
            "owner": github_ref.owner,
            "repo": github_ref.repo,
            "ref": github_ref.ref,
            "clone_url": github_ref.clone_url,
            "cloned_at": time.time(),
            "cache_key": github_ref.cache_key,
        }
        (cache_path / self.META_FILE).write_text(json.dumps(meta, indent=2))

    def _find_agent_dir(self, cache_path: Path, subdirectory: Optional[str]) -> Path:
        """Locate the directory containing agent.yaml."""
        if subdirectory:
            candidate = cache_path / subdirectory
            if (candidate / "agent.yaml").exists():
                return candidate
            raise GitHubResolverError(
                f"agent.yaml not found in subdirectory '{subdirectory}'"
            )

        # Check repo root
        if (cache_path / "agent.yaml").exists():
            return cache_path

        # Search one level deep
        for child in sorted(cache_path.iterdir()):
            if child.is_dir() and (child / "agent.yaml").exists():
                return child

        # Check for bundled wrappers for known agents
        meta_path = cache_path / self.META_FILE
        if meta_path.exists():
            meta = json.loads(meta_path.read_text())
            repo_id = f"{meta.get('owner', '')}/{meta.get('repo', '')}".lower()
            if _inject_known_agent(repo_id, cache_path):
                return cache_path

        raise GitHubResolverError(
            f"No agent.yaml found in repository. "
            f"Agent repos must include an agent.yaml manifest at the root. "
            f"See the Agent Store Standard for the required repo structure."
        )
