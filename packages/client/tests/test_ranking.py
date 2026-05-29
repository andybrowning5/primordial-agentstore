"""Tests for blended ranking (feature 1b)."""

import numpy as np

import primordial.ranking as ranking


def _agents():
    return [
        {
            "id": "a/popular-relevant",
            "name": "research bot",
            "description": "web research and search",
            "stars": 500,
            "signals": {"stars": 500, "runs_30d": 800, "rating_avg": 4.8, "rating_count": 40},
        },
        {
            "id": "b/relevant-unknown",
            "name": "research helper",
            "description": "web research",
            "stars": 2,
            "signals": {"stars": 2, "runs_30d": 0, "rating_avg": None, "rating_count": 0},
        },
        {
            "id": "c/irrelevant-popular",
            "name": "image editor",
            "description": "edits photos",
            "stars": 1000,
            "signals": {"stars": 1000, "runs_30d": 900, "rating_avg": 5.0, "rating_count": 80},
        },
    ]


def test_popularity_score_handles_null_rating():
    none_rating = {"signals": {"runs_30d": 0, "rating_avg": None}}
    assert ranking._popularity_score(none_rating) == 0.0
    with_runs = {"signals": {"runs_30d": 1000, "rating_avg": None}}
    assert ranking._popularity_score(with_runs) > 0.5


def test_blended_rank_attaches_score_confidence_why(monkeypatch):
    # Force semantic component so the test is deterministic + fast (no model).
    sims = {"a/popular-relevant": 0.9, "b/relevant-unknown": 0.85, "c/irrelevant-popular": 0.05}
    agents = _agents()

    def fake_sims(query, ags):
        return np.array([sims[a["id"]] for a in ags])

    monkeypatch.setattr(ranking, "_similarities", fake_sims)
    ranked = ranking.blended_rank("web research", agents, top_k=3)

    assert len(ranked) == 3
    for r in ranked:
        assert "score" in r and "confidence" in r and "why" in r
        assert r["confidence"] in ("high", "medium", "low")
    # Relevant agents outrank the irrelevant-but-popular one.
    assert ranked[0]["id"] in ("a/popular-relevant", "b/relevant-unknown")
    assert ranked[-1]["id"] == "c/irrelevant-popular"
    # Among relevant, the popular one wins on the tie-break.
    assert ranked[0]["id"] == "a/popular-relevant"


def test_blended_rank_degrades_without_embeddings(monkeypatch):
    monkeypatch.setattr(ranking, "_similarities", lambda q, a: None)
    ranked = ranking.blended_rank("anything", _agents(), top_k=3)
    assert len(ranked) == 3
    # Falls back to popularity/stars: the most popular ranks first.
    assert ranked[0]["id"] == "c/irrelevant-popular"


def test_blended_rank_empty():
    assert ranking.blended_rank("q", [], top_k=5) == []
