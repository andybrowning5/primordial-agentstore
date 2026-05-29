"""Catalog prefetch + cache for fast local agent routing.

Fetches the index's ``catalog.json`` (the integration seam defined in
docs/developers/index-contract.md), caches it to ``cache_dir/catalog.json``
with a 6h TTL, and exposes a uniform list of agent dicts for ranking.

On ANY index failure (network, HTTP, malformed JSON, non-HTTPS) it falls
back to live GitHub discovery (``discovery.py``) so routing never hard-fails.
"""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path

import httpx

from primordial.config import CATALOG_TTL_SECONDS, get_config

logger = logging.getLogger(__name__)


def _cache_is_fresh(path: Path, ttl: int) -> bool:
    try:
        return (time.time() - path.stat().st_mtime) < ttl
    except FileNotFoundError:
        return False


def _read_cache(path: Path) -> list[dict] | None:
    try:
        data = json.loads(path.read_text())
    except (FileNotFoundError, ValueError):
        return None
    agents = data.get("agents") if isinstance(data, dict) else None
    return agents if isinstance(agents, list) else None


def _fetch_remote_catalog(index_url: str) -> list[dict]:
    """Fetch {index_url}/catalog. Raises on any failure."""
    # SECURITY: only ever talk to an HTTPS index endpoint.
    if not index_url.startswith("https://"):
        raise ValueError(f"Refusing non-HTTPS index URL: {index_url!r}")
    resp = httpx.get(
        f"{index_url}/catalog",
        headers={"Accept": "application/json"},
        timeout=10,
        follow_redirects=True,
    )
    resp.raise_for_status()
    data = resp.json()
    agents = data.get("agents") if isinstance(data, dict) else None
    if not isinstance(agents, list):
        raise ValueError("catalog.json missing 'agents' array")
    return agents


def _catalog_to_agent_dicts(agents: list[dict]) -> list[dict]:
    """Normalize catalog entries into the dict shape used by ranking/search.

    Keeps the catalog ``id`` (owner/repo, the join key) and ``signals`` while
    mapping fields onto the keys discovery.py already produces (name, url,
    description, stars, tags, category, providers) so the rest of the code
    can treat both sources uniformly.
    """
    out: list[dict] = []
    for a in agents:
        if not isinstance(a, dict):
            continue
        signals = a.get("signals") or {}
        perms = a.get("permissions") or {}
        entry = {
            "id": a.get("id") or a.get("name", ""),
            "name": a.get("id") or a.get("name", ""),
            "display_name": a.get("display_name") or a.get("name", ""),
            "description": a.get("description") or "",
            "url": a.get("url") or "",
            "stars": signals.get("stars", 0) or 0,
            "tags": a.get("tags") or [],
            "category": a.get("category") or "",
            "providers": a.get("providers") or [],
            "signals": signals,
            "trust": a.get("trust"),
            "version": a.get("version"),
        }
        if perms.get("delegation"):
            entry["can_delegate"] = True
        if perms.get("network") or perms.get("network_unrestricted"):
            entry["has_network"] = True
        out.append(entry)
    return out


def load_catalog(force_refresh: bool = False) -> tuple[list[dict], str]:
    """Return (agents, source).

    ``source`` is one of: "cache", "index", "github".

    1. Use a fresh on-disk cache when available (unless force_refresh).
    2. Otherwise fetch the index, write the cache, return it.
    3. On ANY index failure, fall back to a stale cache if present, else to
       live GitHub discovery. Never raises for routing callers.
    """
    config = get_config()
    cache_file = config.catalog_cache_file

    if not force_refresh and _cache_is_fresh(cache_file, CATALOG_TTL_SECONDS):
        cached = _read_cache(cache_file)
        if cached is not None:
            return _catalog_to_agent_dicts(cached), "cache"

    try:
        agents = _fetch_remote_catalog(config.index_url)
        try:
            cache_file.write_text(json.dumps({"agents": agents}))
        except OSError as e:
            logger.warning("Failed to write catalog cache: %s", e)
        return _catalog_to_agent_dicts(agents), "index"
    except Exception as e:
        logger.warning("Index catalog fetch failed (%s) — falling back", e)

    # Stale cache beats a network round-trip to GitHub.
    cached = _read_cache(cache_file)
    if cached is not None:
        return _catalog_to_agent_dicts(cached), "cache"

    # Last resort: live GitHub discovery.
    from primordial.discovery import enrich_from_cache, fetch_agents

    agents = enrich_from_cache(fetch_agents())
    return agents, "github"
