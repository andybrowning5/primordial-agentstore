"""Semantic ranking for agent search using FastEmbed embeddings."""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

_embed_model = None


def _get_embed_model():
    """Lazy-load the FastEmbed text embedding model."""
    global _embed_model
    if _embed_model is None:
        try:
            from fastembed import TextEmbedding
            _embed_model = TextEmbedding()
        except ImportError:
            logger.warning("fastembed not installed — semantic search unavailable")
            return None
    return _embed_model


def build_search_text(agent: dict) -> str:
    """Build rich text for embedding from agent data.

    Uses name + description from GitHub, plus manifest-derived fields
    (tags, category, providers, permissions) when available via cache.
    """
    parts = [agent.get("name", ""), agent.get("description", "")]

    if agent.get("tags"):
        parts.append("tags: " + ", ".join(agent["tags"]))
    if agent.get("category"):
        parts.append("category: " + agent["category"])
    if agent.get("providers"):
        parts.append("uses: " + ", ".join(agent["providers"]))
    if agent.get("can_delegate"):
        parts.append("can delegate to other agents")
    if agent.get("has_network"):
        parts.append("has network access")

    return " | ".join(p for p in parts if p)


def semantic_rank(query: str, agents: list[dict], top_k: int = 10) -> list[dict]:
    """Rank agents by cosine similarity of FastEmbed embeddings.

    If FastEmbed is unavailable, returns agents unchanged (truncated to top_k).
    """
    similarities = _similarities(query, agents)
    if similarities is None:
        return agents[:top_k]
    top_indices = (-similarities).argsort()[:top_k]
    return [agents[i] for i in top_indices]


def _similarities(query: str, agents: list[dict]):
    """Cosine similarities of query vs each agent, or None if unavailable."""
    import numpy as np

    model = _get_embed_model()
    if not model or not agents:
        return None

    texts = [build_search_text(a) for a in agents]
    query_emb = list(model.embed([query]))[0]
    doc_embs = list(model.embed(texts))

    doc_arr = np.array(doc_embs)
    query_arr = np.array(query_emb)

    norms = np.linalg.norm(doc_arr, axis=1) * np.linalg.norm(query_arr)
    norms[norms == 0] = 1.0
    return doc_arr @ query_arr / norms


# Blend weights — semantic relevance dominates; popularity/quality break ties.
_W_SEMANTIC = 0.70
_W_POPULARITY = 0.20
_W_STARS = 0.10


def _popularity_score(agent: dict) -> float:
    """0..1 popularity from telemetry signals (runs_30d + rating_avg)."""
    import math

    signals = agent.get("signals") or {}
    runs = signals.get("runs_30d") or 0
    rating = signals.get("rating_avg")
    # log-scale runs so a handful of runs already registers; saturates ~1k.
    runs_score = min(1.0, math.log10(runs + 1) / 3.0) if runs else 0.0
    if rating is None:
        # No ratings yet — popularity is driven purely by runs.
        return runs_score
    rating_score = max(0.0, min(1.0, (rating - 1.0) / 4.0))
    return 0.5 * runs_score + 0.5 * rating_score


def _stars_score(agent: dict, max_stars: int) -> float:
    import math

    stars = agent.get("stars")
    if stars is None:
        stars = (agent.get("signals") or {}).get("stars", 0)
    stars = stars or 0
    if max_stars <= 0:
        return 0.0
    # log-scale so a 5000-star repo doesn't crush a 50-star one entirely.
    return min(1.0, math.log10(stars + 1) / math.log10(max_stars + 1))


def _why(agent: dict, sem: float) -> str:
    """One-line, human-readable rationale for the ranking."""
    signals = agent.get("signals") or {}
    bits: list[str] = []
    if sem >= 0.55:
        bits.append("strong match for the task")
    elif sem >= 0.4:
        bits.append("relevant capabilities")
    else:
        bits.append("loosely related")
    cat = agent.get("category")
    if cat:
        bits.append(f"{cat} category")
    rating = signals.get("rating_avg")
    count = signals.get("rating_count") or 0
    if isinstance(rating, (int, float)) and count:
        bits.append(f"rated {rating:.1f}/5 ({count})")
    runs = signals.get("runs_30d") or 0
    if runs:
        bits.append(f"{runs} runs/30d")
    stars = agent.get("stars") or signals.get("stars") or 0
    if stars:
        bits.append(f"{stars} stars")
    return ", ".join(bits)


def blended_rank(query: str, agents: list[dict], top_k: int = 5) -> list[dict]:
    """Rank agents by a blended score for task routing.

    score = semantic similarity + popularity (runs_30d, rating_avg) + stars.

    Returns a list of dicts (copies of the inputs) each augmented with:
      - ``score``      : float 0..1 blended score
      - ``confidence`` : "high" | "medium" | "low"
      - ``why``        : one-line rationale string

    Degrades gracefully when FastEmbed is unavailable: falls back to
    popularity + stars only.
    """
    if not agents:
        return []

    sims = _similarities(query, agents)
    semantic_available = sims is not None

    max_stars = max(
        (a.get("stars") or (a.get("signals") or {}).get("stars", 0) or 0)
        for a in agents
    )

    scored: list[dict] = []
    for i, agent in enumerate(agents):
        sem = float(sims[i]) if semantic_available else 0.5
        # Cosine can be slightly negative; clamp to 0..1.
        sem = max(0.0, min(1.0, sem))
        pop = _popularity_score(agent)
        stars = _stars_score(agent, max_stars)

        if semantic_available:
            score = _W_SEMANTIC * sem + _W_POPULARITY * pop + _W_STARS * stars
        else:
            # Without embeddings, weight popularity/stars only.
            score = 0.6 * pop + 0.4 * stars

        if score >= 0.6:
            confidence = "high"
        elif score >= 0.4:
            confidence = "medium"
        else:
            confidence = "low"

        result = dict(agent)
        result["score"] = round(score, 4)
        result["confidence"] = confidence
        result["why"] = _why(agent, sem if semantic_available else 0.45)
        scored.append(result)

    scored.sort(key=lambda a: a["score"], reverse=True)
    return scored[:top_k]
