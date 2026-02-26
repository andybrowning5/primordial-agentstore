"""Primordial daemon client — connects to the local Unix socket server."""

from __future__ import annotations

import json
import socket
from pathlib import Path
from typing import Generator

from primordial.config import get_data_dir

SOCKET_NAME = "daemon.sock"


def _socket_path() -> Path:
    return get_data_dir() / SOCKET_NAME


def is_daemon_running() -> bool:
    """Check if the daemon is listening."""
    path = _socket_path()
    if not path.exists():
        return False
    try:
        with _connect() as sock:
            sock.sendall(json.dumps({"method": "ping"}).encode() + b"\n")
            line = _readline(sock, timeout=2)
            return line is not None and json.loads(line).get("ok") is True
    except (OSError, json.JSONDecodeError, ValueError):
        return False


def _connect() -> socket.socket:
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.connect(str(_socket_path()))
    return sock


def _readline(sock: socket.socket, timeout: float = 300) -> str | None:
    sock.settimeout(timeout)
    buf = b""
    while True:
        chunk = sock.recv(4096)
        if not chunk:
            return buf.decode() if buf else None
        buf += chunk
        if b"\n" in buf:
            line, _ = buf.split(b"\n", 1)
            return line.decode()


def stream_request(request: dict) -> Generator[dict, None, None]:
    """Send a request to the daemon and yield NDJSON response lines."""
    with _connect() as sock:
        sock.sendall(json.dumps(request).encode() + b"\n")
        sock.settimeout(300)
        buf = b""
        while True:
            chunk = sock.recv(4096)
            if not chunk:
                break
            buf += chunk
            while b"\n" in buf:
                line, buf = buf.split(b"\n", 1)
                if line.strip():
                    msg = json.loads(line.decode())
                    yield msg
                    if msg.get("type") == "done":
                        return
