"""Tests for hello-agent."""

from src.agent import run


def test_basic_run():
    result = run(task="Say hello", workspace=".")
    assert result["status"] == "success"
    assert "greeting" in result
    assert "workspace_summary" in result


def test_greeting_contains_task():
    result = run(task="Test greeting", workspace=".")
    assert "Test greeting" in result["greeting"]
