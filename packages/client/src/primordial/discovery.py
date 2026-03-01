"""Shared agent discovery — fetches Primordial agents from GitHub."""

from __future__ import annotations

import httpx

GITHUB_SEARCH_URL = "https://api.github.com/search/repositories"
TOPICS = ("primordial-agent", "primordial-agent-test")


def fetch_agents(query: str | None = None) -> list[dict]:
    """Search GitHub for Primordial agents, returning a compact list.

    Searches across all agent topics, deduplicates by URL, and returns
    results sorted by stars descending.

    Returns list of dicts with keys: name, description, url, stars.
    """
    seen: set[str] = set()
    results: list[dict] = []
    for topic in TOPICS:
        q = f"topic:{topic} {query}" if query else f"topic:{topic}"
        resp = httpx.get(
            GITHUB_SEARCH_URL,
            params={"q": q, "sort": "stars", "order": "desc", "per_page": 20},
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
                })
    results.sort(key=lambda r: r["stars"], reverse=True)
    return results
