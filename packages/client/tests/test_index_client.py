"""Tests for the ratings/telemetry client (feature 4b)."""

import pytest

import primordial.index_client as ic


def test_resolve_github_token_prefers_env(monkeypatch):
    monkeypatch.setenv("GH_TOKEN", "ghp_fromenv")
    assert ic.resolve_github_token() == "ghp_fromenv"


def test_submit_rating_validates_stars(isolated_config):
    with pytest.raises(ValueError):
        ic.submit_rating("a/b", 0)
    with pytest.raises(ValueError):
        ic.submit_rating("a/b", 6)


def test_submit_rating_requires_token(isolated_config, monkeypatch):
    monkeypatch.delenv("GH_TOKEN", raising=False)
    monkeypatch.delenv("GITHUB_TOKEN", raising=False)
    monkeypatch.setattr(ic, "resolve_github_token", lambda: None)
    with pytest.raises(ValueError, match="GitHub token"):
        ic.submit_rating("a/b", 5)


def test_submit_rating_posts_expected_payload(isolated_config, monkeypatch):
    monkeypatch.setattr(ic, "resolve_github_token", lambda: "tok123")
    captured = {}

    class _Resp:
        def raise_for_status(self):
            pass

        def json(self):
            return {"ok": True, "rating_avg": 4.0, "rating_count": 2}

    def fake_post(url, json, timeout, follow_redirects):
        captured["url"] = url
        captured["json"] = json
        return _Resp()

    monkeypatch.setattr(ic.httpx, "post", fake_post)
    result = ic.submit_rating("alice/web-research", 5, comment="great")
    assert captured["url"].endswith("/ratings")
    assert captured["json"] == {
        "agent_id": "alice/web-research",
        "stars": 5,
        "gh_token": "tok123",
        "comment": "great",
    }
    assert result["rating_avg"] == 4.0


def test_send_event_noop_when_telemetry_disabled(isolated_config, monkeypatch):
    # telemetry defaults off
    called = {"n": 0}
    monkeypatch.setattr(ic.httpx, "post", lambda *a, **k: called.__setitem__("n", called["n"] + 1))
    assert ic.send_event("a/b", "run_start") is False
    assert called["n"] == 0


def test_send_event_posts_anonymous_payload_when_enabled(isolated_config, monkeypatch):
    isolated_config.set_telemetry_enabled(True)
    captured = {}

    def fake_post(url, json, timeout):
        captured["url"] = url
        captured["json"] = json

    monkeypatch.setattr(ic.httpx, "post", fake_post)
    assert ic.send_event("a/b", "run_complete", success=True, duration_ms=1234) is True
    assert captured["url"].endswith("/events")
    body = captured["json"]
    assert body["agent_id"] == "a/b"
    assert body["event"] == "run_complete"
    assert body["success"] is True
    assert body["duration_ms"] == 1234
    assert body["client_id"] == isolated_config.client_id
    # No PII fields.
    assert set(body) <= {"agent_id", "event", "client_id", "ts", "success", "duration_ms"}


def test_send_event_swallows_network_errors(isolated_config, monkeypatch):
    isolated_config.set_telemetry_enabled(True)

    def boom(*a, **k):
        raise ic.httpx.ConnectError("nope")

    monkeypatch.setattr(ic.httpx, "post", boom)
    # Must not raise.
    assert ic.send_event("a/b", "run_start") is False
