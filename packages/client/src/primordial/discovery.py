"""Shared agent discovery — fetches Primordial agents from GitHub."""

from __future__ import annotations

import logging
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

GITHUB_SEARCH_URL = "https://api.github.com/search/repositories"
TOPICS = ("primordial-agent", "primordial-agent-test")
MAX_RESULTS = 25


def fetch_agents() -> list[dict]:
    """Fetch all Primordial agents from GitHub, sorted by stars.

    Searches across all agent topics, deduplicates by URL, and returns
    results sorted by stars descending.

    Returns list of dicts with keys: name, description, url, stars, topics.
    """
    seen: set[str] = set()
    results: list[dict] = []
    for topic in TOPICS:
        q = f"topic:{topic}"
        resp = httpx.get(
            GITHUB_SEARCH_URL,
            params={"q": q, "sort": "stars", "order": "desc", "per_page": MAX_RESULTS},
            headers={"Accept": "application/vnd.github.v3+json"},
            timeout=10,
        )
        resp.raise_for_status()
        for item in resp.json().get("items", []):
            url = item["html_url"]
            if url not in seen:
                seen.add(url)
                results.append({
                    "name": item["full_name"],
                    "description": item.get("description") or "",
                    "url": url,
                    "stars": item.get("stargazers_count", 0),
                    "topics": item.get("topics") or [],
                })
    results.sort(key=lambda r: r["stars"], reverse=True)
    return results


def enrich_from_cache(agents: list[dict]) -> list[dict]:
    """Enrich agent dicts with manifest data from locally cached repos.

    For each agent that has been previously cloned, loads the manifest
    and adds tags, category, provider, and permission info. This makes
    semantic search richer — queries like "agent that uses anthropic"
    or "agent that can delegate" will match on manifest fields.
    """
    from primordial.github import GitHubResolver, parse_github_url
    from primordial.manifest import load_manifest

    resolver = GitHubResolver(quiet=True)

    # Build lookup from "owner/repo" → cache path
    cached: dict[str, str] = {}
    for entry in resolver.list_cached():
        key = f"{entry['owner']}/{entry['repo']}"
        cached[key] = entry["path"]

    for agent in agents:
        path = cached.get(agent["name"])
        if not path:
            continue
        try:
            # find_agent_dir logic: load_manifest handles dir → agent.yaml
            manifest = load_manifest(Path(path))
            if manifest.tags:
                agent["tags"] = manifest.tags
            if manifest.category:
                agent["category"] = manifest.category
            if manifest.keys:
                agent["providers"] = [k.provider for k in manifest.keys]
            if manifest.permissions.delegation.enabled:
                agent["can_delegate"] = True
            if manifest.permissions.network or manifest.permissions.network_unrestricted:
                agent["has_network"] = True
        except Exception:
            continue

    return agents
