"""Smoke tests: new CLI commands are registered and behave at the edges."""

import json

from click.testing import CliRunner

from primordial.cli.main import cli


def test_all_new_commands_registered():
    names = set(cli.commands)
    assert {"recommend", "dev", "publish", "rate"} <= names


def test_dev_help_is_honest_about_no_sandbox():
    result = CliRunner().invoke(cli, ["dev", "--help"])
    assert result.exit_code == 0
    assert "not" in result.output.lower() and "sandbox" in result.output.lower()


def test_publish_dry_run_help():
    result = CliRunner().invoke(cli, ["publish", "--help"])
    assert result.exit_code == 0
    assert "--dry-run" in result.output


def test_recommend_agent_json_output(monkeypatch, isolated_config):
    import primordial.catalog as catalog
    import primordial.ranking as ranking

    sample = [
        {
            "id": "alice/web-research",
            "name": "alice/web-research",
            "display_name": "Web Research",
            "url": "https://github.com/alice/web-research",
            "description": "research",
            "stars": 10,
            "signals": {"stars": 10, "runs_30d": 5, "rating_avg": 4.0, "rating_count": 2},
        }
    ]
    monkeypatch.setattr(catalog, "load_catalog", lambda force_refresh=False: (sample, "cache"))
    monkeypatch.setattr(ranking, "_similarities", lambda q, a: None)

    result = CliRunner().invoke(cli, ["recommend", "do web research", "--agent"])
    assert result.exit_code == 0
    payload = json.loads(result.output)
    assert payload["source"] == "cache"
    assert payload["candidates"][0]["id"] == "alice/web-research"
    assert payload["candidates"][0]["confidence"] in ("high", "medium", "low")
    assert "why" in payload["candidates"][0]


def test_rate_rejects_out_of_range_stars():
    result = CliRunner().invoke(cli, ["rate", "alice/web-research", "9"])
    assert result.exit_code != 0
