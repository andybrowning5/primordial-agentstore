"""Shared fixtures: isolate config to a temp dir so tests never touch real state."""

import pytest


@pytest.fixture
def isolated_config(tmp_path, monkeypatch):
    """Point data_dir / cache_dir at tmp_path and reset the config singleton."""
    monkeypatch.delenv("PRIMORDIAL_INDEX_URL", raising=False)

    import primordial.config as config_mod

    data_dir = tmp_path / "data"
    cache_dir = tmp_path / "cache"
    data_dir.mkdir()
    cache_dir.mkdir()

    monkeypatch.setattr(config_mod, "get_data_dir", lambda: data_dir)
    monkeypatch.setattr(config_mod, "get_cache_dir", lambda: cache_dir)
    monkeypatch.setattr(config_mod, "_config", None)

    cfg = config_mod.get_config()
    yield cfg
    config_mod._config = None
