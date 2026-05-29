"""Tests for catalog prefetch/cache/normalization/fallback (feature 1b)."""

import json
import time

import pytest

import primordial.catalog as catalog


def _sample_catalog():
    return {
        "schema_version": "1",
        "agents": [
            {
                "id": "alice/web-research",
                "url": "https://github.com/alice/web-research",
                "name": "web-research",
                "display_name": "Web Research",
                "description": "Research the web",
                "category": "research",
                "tags": ["web", "search"],
                "providers": ["anthropic", "tavily"],
                "permissions": {"network": ["api.tavily.com"], "delegation": True},
                "trust": "auto",
                "signals": {"stars": 42, "runs_30d": 10, "rating_avg": 4.5, "rating_count": 3},
            }
        ],
    }


def test_normalization_preserves_join_key_and_signals():
    agents = catalog._catalog_to_agent_dicts(_sample_catalog()["agents"])
    a = agents[0]
    assert a["id"] == "alice/web-research"
    assert a["name"] == "alice/web-research"  # name used as join key downstream
    assert a["stars"] == 42
    assert a["signals"]["runs_30d"] == 10
    assert a["can_delegate"] is True
    assert a["has_network"] is True
    assert a["providers"] == ["anthropic", "tavily"]


def test_load_catalog_uses_fresh_cache_without_network(isolated_config, monkeypatch):
    isolated_config.catalog_cache_file.write_text(json.dumps(_sample_catalog()))

    def _boom(*a, **k):
        raise AssertionError("should not hit the network when cache is fresh")

    monkeypatch.setattr(catalog, "_fetch_remote_catalog", _boom)
    agents, source = catalog.load_catalog()
    assert source == "cache"
    assert agents[0]["id"] == "alice/web-research"


def test_load_catalog_fetches_and_writes_cache(isolated_config, monkeypatch):
    monkeypatch.setattr(
        catalog, "_fetch_remote_catalog", lambda url: _sample_catalog()["agents"]
    )
    agents, source = catalog.load_catalog(force_refresh=True)
    assert source == "index"
    assert agents[0]["id"] == "alice/web-research"
    # Cache file written for next time.
    assert isolated_config.catalog_cache_file.exists()
    cached = json.loads(isolated_config.catalog_cache_file.read_text())
    assert cached["agents"][0]["id"] == "alice/web-research"


def test_load_catalog_falls_back_to_github_on_index_failure(isolated_config, monkeypatch):
    def _fail(url):
        raise RuntimeError("index down")

    monkeypatch.setattr(catalog, "_fetch_remote_catalog", _fail)

    # No cache present → should fall back to discovery.fetch_agents.
    import primordial.discovery as discovery
    monkeypatch.setattr(
        discovery, "fetch_agents",
        lambda: [{"name": "bob/fallback", "description": "d", "url": "u", "stars": 1, "topics": []}],
    )
    monkeypatch.setattr(discovery, "enrich_from_cache", lambda a: a)

    agents, source = catalog.load_catalog(force_refresh=True)
    assert source == "github"
    assert agents[0]["name"] == "bob/fallback"


def test_load_catalog_prefers_stale_cache_over_github(isolated_config, monkeypatch):
    isolated_config.catalog_cache_file.write_text(json.dumps(_sample_catalog()))
    # Make the cache stale.
    old = time.time() - (catalog.CATALOG_TTL_SECONDS + 100)
    import os
    os.utime(isolated_config.catalog_cache_file, (old, old))

    monkeypatch.setattr(catalog, "_fetch_remote_catalog", lambda url: (_ for _ in ()).throw(RuntimeError("down")))
    agents, source = catalog.load_catalog()
    assert source == "cache"
    assert agents[0]["id"] == "alice/web-research"


def test_fetch_remote_rejects_non_https():
    with pytest.raises(ValueError):
        catalog._fetch_remote_catalog("http://insecure.example.com")
