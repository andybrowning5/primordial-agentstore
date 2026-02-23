"""Primordial Delegation SDK for Python.

Provides a simple API for agents to search, spawn, and interact with other
agents on the Primordial AgentStore via the delegation socket.

Usage:
    from primordial_delegate import search, run_agent, message_agent, stop_agent

STDLIB ONLY — no third-party dependencies.
"""

import json
import socket
import sys

SOCK_PATH = "/tmp/_primordial_delegate.sock"


# ---------------------------------------------------------------------------
# Socket helpers (fresh connection per call)
# ---------------------------------------------------------------------------

def _connect():
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.connect(SOCK_PATH)
    return sock


def _send(sock, obj):
    sock.sendall((json.dumps(obj) + "\n").encode())


def _read_line(sock, buf=b""):
    while b"\n" not in buf:
        chunk = sock.recv(8192)
        if not chunk:
            raise ConnectionError("Delegation socket closed")
        buf += chunk
    line, buf = buf.split(b"\n", 1)
    return json.loads(line), buf


def _request(msg):
    """Send a command and return a single response."""
    sock = _connect()
    try:
        _send(sock, msg)
        result, _ = _read_line(sock)
        if result.get("type") == "error":
            raise RuntimeError(result.get("error", "unknown error"))
        return result
    finally:
        sock.close()


def _request_stream(msg):
    """Send a command and yield responses until stream ends."""
    sock = _connect()
    buf = b""
    try:
        _send(sock, msg)
        while True:
            result, buf = _read_line(sock, buf)
            yield result
            if result.get("type") == "error":
                return
            if result.get("done", False):
                return
            # For run: stream ends on non-setup_status
            if result.get("type") not in ("setup_status", "stream_event"):
                return
    finally:
        sock.close()


# ---------------------------------------------------------------------------
# Activity emission
# ---------------------------------------------------------------------------

def emit_activity(tool, description, message_id=None):
    """Emit a Primordial Protocol activity event to stdout.

    Call this to let the parent agent / TUI see sub-agent progress
    in real-time.
    """
    event = {"type": "activity", "tool": tool, "description": description}
    if message_id:
        event["message_id"] = message_id
    sys.stdout.write(json.dumps(event) + "\n")
    sys.stdout.flush()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def search(query):
    """Search for agents by capability.

    Args:
        query: Natural language description (e.g. "web research").

    Returns:
        List of agent dicts with name, description, url, stars.
    """
    result = _request({"type": "search", "query": query})
    return result.get("agents", [])


def search_all():
    """List all available agents sorted by popularity.

    Returns:
        List of agent dicts with name, description, url, stars.
    """
    result = _request({"type": "search_all"})
    return result.get("agents", [])


def run_agent(agent_url, on_status=None):
    """Spawn a sub-agent in its own sandbox.

    Args:
        agent_url: GitHub URL of the agent to spawn.
        on_status: Optional callback(event_dict) called for each setup status.

    Returns:
        session_id string.

    Raises:
        RuntimeError: If the agent fails to start.
    """
    for event in _request_stream({"type": "run", "agent_url": agent_url}):
        if event.get("type") == "setup_status":
            if on_status:
                on_status(event)
        elif event.get("type") == "session":
            return event["session_id"]
        elif event.get("type") == "error":
            raise RuntimeError(event.get("error", "Failed to start agent"))
    raise RuntimeError("Unexpected end of stream during agent startup")


def message_agent(session_id, content, on_activity=None):
    """Send a message to a sub-agent and wait for the response.

    Args:
        session_id: Session ID from run_agent.
        content: Message text to send.
        on_activity: Optional callback(tool, description) for activity events.

    Returns:
        Dict with "response" (str) and "activities" (list of dicts).
    """
    activities = []
    response = ""

    for event in message_agent_stream(session_id, content):
        if event.get("type") != "stream_event":
            continue
        inner = event.get("event", {})
        if inner.get("type") == "activity":
            tool = inner.get("tool", "")
            desc = inner.get("description", "")
            activities.append({"tool": tool, "description": desc})
            if on_activity:
                on_activity(tool, desc)
        elif inner.get("type") == "response" and inner.get("done"):
            response = inner.get("content", "")

    return {"response": response, "activities": activities}


def message_agent_stream(session_id, content):
    """Send a message and yield raw stream events.

    Args:
        session_id: Session ID from run_agent.
        content: Message text to send.

    Yields:
        Raw event dicts from the delegation proxy.
    """
    yield from _request_stream({
        "type": "message",
        "session_id": session_id,
        "content": content,
    })


def monitor_agent(session_id):
    """View the last 1000 lines of a sub-agent's output.

    Args:
        session_id: Session ID from run_agent.

    Returns:
        List of output line strings.
    """
    result = _request({"type": "monitor", "session_id": session_id})
    return result.get("lines", [])


def stop_agent(session_id):
    """Shut down a sub-agent and release its sandbox.

    Args:
        session_id: Session ID from run_agent.

    Raises:
        RuntimeError: If the session is unknown.
    """
    _request({"type": "stop", "session_id": session_id})
