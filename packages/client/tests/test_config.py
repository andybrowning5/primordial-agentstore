"""Tests for config additions: index_url, telemetry, client_id."""

import primordial.config as config_mod


def test_index_url_default(isolated_config):
    assert isolated_config.index_url == "https://index.primordial.dev"


def test_index_url_env_override(isolated_config, monkeypatch):
    monkeypatch.setenv("PRIMORDIAL_INDEX_URL", "https://my.index.example.com/")
    # env takes precedence and trailing slash is stripped
    assert isolated_config.index_url == "https://my.index.example.com"


def test_index_url_config_setting(isolated_config):
    isolated_config.set_setting("index_url", "https://configured.example.com")
    assert isolated_config.index_url == "https://configured.example.com"


def test_telemetry_defaults_off_and_undecided(isolated_config):
    assert isolated_config.telemetry_enabled is False
    assert isolated_config.telemetry_decided is False


def test_telemetry_set_persists(isolated_config):
    isolated_config.set_telemetry_enabled(True)
    assert isolated_config.telemetry_enabled is True
    assert isolated_config.telemetry_decided is True

    # New config instance reads the persisted file.
    config_mod._config = None
    fresh = config_mod.get_config()
    assert fresh.telemetry_enabled is True


def test_client_id_is_stable_and_anonymous(isolated_config):
    cid1 = isolated_config.client_id
    cid2 = isolated_config.client_id
    assert cid1 == cid2
    # 32-hex uuid, no PII
    assert len(cid1) == 32
    int(cid1, 16)  # valid hex

    config_mod._config = None
    fresh = config_mod.get_config()
    assert fresh.client_id == cid1
