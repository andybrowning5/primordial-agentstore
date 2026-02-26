"""Primordial daemon client — connects to the local Unix socket server."""

from __future__ import annotations

import json
import socket
import sys
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


class _SocketLineReader:
    """Buffered line reader over a socket."""

    def __init__(self, sock: socket.socket):
        self._sock = sock
        self._buf = b""

    def readline(self, timeout: float = 300) -> dict | None:
        """Read one NDJSON line from the socket. Returns parsed dict or None on close."""
        self._sock.settimeout(timeout)
        while True:
            if b"\n" in self._buf:
                line, self._buf = self._buf.split(b"\n", 1)
                if line.strip():
                    return json.loads(line.decode())
                continue
            chunk = self._sock.recv(4096)
            if not chunk:
                return None
            self._buf += chunk


def relay_run(request: dict) -> None:
    """Send a run request, relay stdin to daemon and daemon responses to stdout.

    Sequential protocol:
    1. Send run request, wait for ready
    2. For each stdin line: send to daemon, drain responses until done:true
    3. On stdin EOF or shutdown: send shutdown, drain final done, exit
    """
    sock = _connect()
    reader = _SocketLineReader(sock)
    try:
        sock.sendall(json.dumps(request).encode() + b"\n")

        # Phase 1: Wait for ready (or error)
        while True:
            msg = reader.readline(timeout=120)
            if msg is None:
                return
            sys.stdout.write(json.dumps(msg) + "\n")
            sys.stdout.flush()
            if msg.get("type") == "ready":
                break
            if msg.get("type") in ("error", "done"):
                return

        # Phase 2: Read stdin lines, send each to daemon, wait for response
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue

            try:
                incoming = json.loads(line)
            except json.JSONDecodeError:
                continue

            if incoming.get("type") == "shutdown":
                sock.sendall(json.dumps({"type": "shutdown"}).encode() + b"\n")
                # Drain until done
                while True:
                    msg = reader.readline(timeout=10)
                    if msg is None or msg.get("type") == "done":
                        return
                return

            # Send message to daemon
            sock.sendall(line.encode() + b"\n")

            # Drain responses until done:true for this message
            while True:
                msg = reader.readline(timeout=300)
                if msg is None:
                    return
                if msg.get("type") == "done":
                    return
                sys.stdout.write(json.dumps(msg) + "\n")
                sys.stdout.flush()
                if msg.get("type") == "response" and msg.get("done"):
                    break
                if msg.get("type") == "error":
                    break

        # stdin EOF — send shutdown
        sock.sendall(json.dumps({"type": "shutdown"}).encode() + b"\n")
        while True:
            msg = reader.readline(timeout=10)
            if msg is None or msg.get("type") == "done":
                return

    finally:
        sock.close()
