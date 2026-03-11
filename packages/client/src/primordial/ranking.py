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
    import numpy as np

    model = _get_embed_model()
    if not model or not agents:
        return agents[:top_k]

    texts = [build_search_text(a) for a in agents]
    query_emb = list(model.embed([query]))[0]
    doc_embs = list(model.embed(texts))

    doc_arr = np.array(doc_embs)
    query_arr = np.array(query_emb)

    norms = np.linalg.norm(doc_arr, axis=1) * np.linalg.norm(query_arr)
    norms[norms == 0] = 1.0
    similarities = doc_arr @ query_arr / norms

    top_indices = (-similarities).argsort()[:top_k]
    return [agents[i] for i in top_indices]
