"""Primordial delegation client for agents.

This module is uploaded to the agent's directory as `primordial_delegate.py`
when delegation is enabled. It provides a clean Python API for discovering
and communicating with sub-agents via the in-sandbox delegation proxy.

Usage:
    from primordial_delegate import search, search_all, run_agent, message_agent, monitor_agent, stop_agent
"""

import json
import socket
from typing import Any, Iterator

_SOCK_PATH = "/tmp/_primordial_delegate.sock"


def _request(msg: dict) -> dict:
    """Send a command to the delegation proxy and return the response."""
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        sock.connect(_SOCK_PATH)
        sock.sendall((json.dumps(msg) + "\n").encode())
        # Read response
        buf = b""
        while b"\n" not in buf:
            data = sock.recv(65536)
            if not data:
                break
            buf += data
        line = buf.split(b"\n", 1)[0]
        return json.loads(line) if line else {"type": "error", "error": "No response"}
    finally:
        sock.close()


def _request_stream(msg: dict) -> Iterator[dict]:
    """Send a command and yield streamed NDJSON responses until done."""
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        sock.connect(_SOCK_PATH)
        sock.sendall((json.dumps(msg) + "\n").encode())
        buf = b""
        while True:
            data = sock.recv(65536)
            if not data:
                break
            buf += data
            while b"\n" in buf:
                line, buf = buf.split(b"\n", 1)
                line = line.strip()
                if not line:
                    continue
                event = json.loads(line)
                yield event
                if event.get("done", False) or event.get("type") == "error":
                    return
    finally:
        sock.close()


def search(query: str) -> list[dict[str, Any]]:
    """Semantic search for agents matching a query.

    Returns the top 5 agents ranked by semantic similarity to the query.
    Uses FastEmbed on the host for free, local embedding-based ranking.

    Args:
        query: Natural language description of the capability needed.

    Returns:
        List of agent dicts with keys: name, description, url, stars.
    """
    resp = _request({"type": "search", "query": query})
    return resp.get("agents", [])


def search_all() -> list[dict[str, Any]]:
    """List all agents on the Primordial AgentStore.

    Returns up to 100 agents sorted by stars (descending).

    Returns:
        List of agent dicts with keys: name, description, url, stars.
    """
    resp = _request({"type": "search_all"})
    return resp.get("agents", [])


def run_agent(agent_url: str) -> str:
    """Spawn a sub-agent and return a session ID for multi-turn conversation.

    The sub-agent runs in its own isolated sandbox with its own permissions.
    Use message_agent() to communicate with it.

    Args:
        agent_url: GitHub URL of the agent to run.

    Returns:
        Session ID string for use with message_agent/monitor_agent/stop_agent.

    Raises:
        RuntimeError: If the agent fails to start.
    """
    resp = _request({"type": "run", "agent_url": agent_url})
    if resp.get("type") == "error":
        raise RuntimeError(resp.get("error", "Failed to start agent"))
    return resp.get("session_id", "")


def message_agent(session_id: str, content: str) -> dict[str, Any]:
    """Send a message to a running sub-agent and get the response.

    Blocks until the sub-agent responds. Returns the final response text
    along with a summary of activities (tool calls, searches) performed.

    Args:
        session_id: Session ID from run_agent().
        content: Message to send to the sub-agent.

    Returns:
        Dict with keys:
            - response: Final response text from the sub-agent.
            - activities: List of activity dicts (tool, description).
    """
    activities = []
    final_response = ""

    for event in message_agent_stream(session_id, content):
        if event.get("type") == "stream_event":
            inner = event.get("event", {})
            if inner.get("type") == "activity":
                activities.append({
                    "tool": inner.get("tool", ""),
                    "description": inner.get("description", ""),
                })
            elif inner.get("type") == "response" and inner.get("done"):
                final_response = inner.get("content", "")

    return {"response": final_response, "activities": activities}


def message_agent_stream(session_id: str, content: str) -> Iterator[dict]:
    """Send a message to a sub-agent and stream events as they arrive.

    Yields activity updates and response chunks in real-time.

    Args:
        session_id: Session ID from run_agent().
        content: Message to send.

    Yields:
        Event dicts from the sub-agent (activity, response, error).
    """
    yield from _request_stream({
        "type": "message",
        "session_id": session_id,
        "content": content,
    })


def monitor_agent(session_id: str) -> list[str]:
    """View the last 1000 lines of a sub-agent's output.

    Like scrolling through a terminal to see what the sub-agent has been
    doing — tool calls, responses, errors.

    Args:
        session_id: Session ID from run_agent().

    Returns:
        List of output lines (most recent last).
    """
    resp = _request({"type": "monitor", "session_id": session_id})
    return resp.get("lines", [])


def stop_agent(session_id: str) -> None:
    """Shutdown a sub-agent session.

    Saves the sub-agent's state so it can be resumed later.

    Args:
        session_id: Session ID from run_agent().
    """
    resp = _request({"type": "stop", "session_id": session_id})
    if resp.get("type") == "error":
        raise RuntimeError(resp.get("error", "Failed to stop agent"))
