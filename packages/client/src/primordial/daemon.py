"""Primordial daemon client — connects to the local Unix socket server."""

from __future__ import annotations

import json
import select
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


def relay_run(request: dict) -> None:
    """Send a run request, relay stdin to daemon and daemon responses to stdout.

    This is the bidirectional version needed for agent mode: stdin lines
    (NDJSON messages from the host agent) are forwarded to the daemon socket,
    and daemon responses are written to stdout.
    """
    sock = _connect()
    try:
        sock.sendall(json.dumps(request).encode() + b"\n")
        sock.setblocking(False)

        recv_buf = b""
        stdin_fd = sys.stdin.fileno()

        while True:
            # Wait for data from either the socket or stdin
            readable, _, _ = select.select([sock, stdin_fd], [], [], 300)
            if not readable:
                # Timeout
                break

            for fd in readable:
                if fd is sock:
                    # Data from daemon → stdout
                    try:
                        chunk = sock.recv(4096)
                    except BlockingIOError:
                        continue
                    if not chunk:
                        return
                    recv_buf += chunk
                    while b"\n" in recv_buf:
                        line, recv_buf = recv_buf.split(b"\n", 1)
                        if line.strip():
                            msg = json.loads(line.decode())
                            if msg.get("type") == "done":
                                return
                            sys.stdout.write(json.dumps(msg) + "\n")
                            sys.stdout.flush()
                            if msg.get("type") == "error":
                                return
                else:
                    # Data from stdin → daemon socket
                    # Temporarily switch to blocking for sendall
                    line = sys.stdin.readline()
                    sock.setblocking(True)
                    try:
                        if not line:
                            # EOF on stdin — send shutdown to daemon
                            sock.sendall(json.dumps({"type": "shutdown"}).encode() + b"\n")
                            sock.setblocking(False)
                            continue
                        line = line.strip()
                        if line:
                            sock.sendall(line.encode() + b"\n")
                    finally:
                        sock.setblocking(False)
    finally:
        sock.close()
