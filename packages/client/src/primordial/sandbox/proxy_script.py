#!/usr/bin/env python3
"""In-sandbox reverse proxy that injects real API keys into outbound requests.

This script runs as root inside an E2B sandbox. It receives its configuration
(routes with real API keys) via stdin as a single JSON line, then starts HTTP
servers on localhost ports. Agent code connects to these local ports; the proxy
forwards requests to the real API over HTTPS with the real key injected.

The agent process (running as "user") cannot read this script, the proxy's
/proc entries, or its environment — Linux user isolation enforced by hidepid=2.

STDLIB ONLY — no third-party dependencies.
"""

import http.client
import http.server
import json
import signal
import ssl
import sys
import threading


# Response headers safe to forward to the agent
_SAFE_RESPONSE_HEADERS = {
    "content-type", "content-length", "content-encoding",
    "date", "server",
    "x-request-id", "x-ratelimit-limit", "x-ratelimit-remaining",
    "x-ratelimit-reset", "retry-after", "cache-control",
}


class ProxyHandler(http.server.BaseHTTPRequestHandler):
    """Forwards HTTP requests to an HTTPS upstream, injecting the real API key."""

    # Use HTTP/1.1 so httpx (Anthropic SDK) keep-alive works correctly.
    protocol_version = "HTTP/1.1"

    # Suppress default stderr logging
    def log_message(self, format, *args):
        pass

    def _proxy(self):
        # SECURITY: Validate session token if configured.
        # Check the auth header matching this route's auth_style.
        if self.server.session_token is not None:
            import hmac
            if self.server.auth_style == "bearer":
                token_found = hmac.compare_digest(
                    self.headers.get("Authorization", ""),
                    f"Bearer {self.server.session_token}",
                )
            else:
                token_found = hmac.compare_digest(
                    self.headers.get(self.server.auth_style, ""),
                    self.server.session_token,
                )
            if not token_found:
                self.send_error(403, "Unauthorized")
                return

        # Close connection after each request to prevent pipelining attacks
        self.close_connection = True

        # SECURITY: Reject CRLF in path to prevent header injection
        if '\r' in self.path or '\n' in self.path:
            self.send_error(400, "Invalid request path")
            return

        # SECURITY: Reject chunked transfer-encoding to prevent smuggling
        te = self.headers.get("Transfer-Encoding", "")
        if te and te.lower() != "identity":
            self.send_error(400, "Chunked transfer not supported")
            return

        # Read request body (cap at 100MB to prevent DoS)
        _MAX_BODY = 100 * 1024 * 1024
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length < 0 or content_length > _MAX_BODY:
            self.send_error(413, "Request body too large")
            return
        body = self.rfile.read(content_length) if content_length else None

        # Build headers for upstream, stripping hop-by-hop and auth headers
        skip = {"host", "transfer-encoding", "connection", "proxy-connection",
                "authorization", self.server.auth_style}
        headers = {}
        for key, value in self.headers.items():
            if key.lower() not in skip:
                headers[key] = value

        # Set correct Host for upstream
        headers["Host"] = self.server.target_host

        # Inject real API key using the auth style declared in the manifest
        if self.server.auth_style == "bearer":
            headers["Authorization"] = f"Bearer {self.server.real_key}"
        else:
            # Custom header (e.g. x-api-key, x-subscription-token)
            headers[self.server.auth_style] = self.server.real_key

        # Connect to upstream over HTTPS
        try:
            ctx = ssl.create_default_context()
            conn = http.client.HTTPSConnection(self.server.target_host, context=ctx)
            conn.request(self.command, self.path, body=body, headers=headers)
            resp = conn.getresponse()
        except Exception:
            # SECURITY: Never include exception details — may leak key material
            self.send_error(502, "Upstream connection failed")
            return

        # Send response status
        self.send_response_only(resp.status)

        # SECURITY: Only forward safe response headers to prevent key leakage
        for key, value in resp.getheaders():
            if key.lower() in _SAFE_RESPONSE_HEADERS:
                self.send_header(key, value)
        self.send_header("Connection", "close")
        self.end_headers()

        # Stream response body in chunks (critical for SSE/streaming)
        try:
            while True:
                chunk = resp.read(8192)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            conn.close()

    # Handle all HTTP methods
    do_GET = _proxy
    do_POST = _proxy
    do_PUT = _proxy
    do_DELETE = _proxy
    do_PATCH = _proxy
    do_HEAD = _proxy
    do_OPTIONS = _proxy


class ThreadedProxyServer(http.server.ThreadingHTTPServer):
    """HTTPServer with route config attached."""

    daemon_threads = True
    # SECURITY: Per-connection read timeout to prevent thread exhaustion DoS
    timeout = 60

    def __init__(self, port, target_host, real_key, auth_style,
                 session_token="", **_):
        self.target_host = target_host
        self.real_key = real_key
        self.auth_style = auth_style
        self.session_token = session_token
        super().__init__(("127.0.0.1", port), ProxyHandler)

    def get_request(self):
        """Set socket timeout on accepted connections."""
        conn, addr = super().get_request()
        conn.settimeout(60)
        return conn, addr


def main():
    # Read config from stdin (single JSON line)
    config_line = sys.stdin.readline().strip()
    if not config_line:
        sys.exit(1)
    config = json.loads(config_line)

    session_token = config.get("session_token", "")

    servers = []
    threads = []

    for route in config["routes"]:
        route["session_token"] = session_token
        server = ThreadedProxyServer(**route)
        t = threading.Thread(target=server.serve_forever, daemon=True)
        t.start()
        servers.append(server)
        threads.append(t)

    # Signal ready
    ports = [r["port"] for r in config["routes"]]
    sys.stdout.write(json.dumps({"status": "ready", "ports": ports}) + "\n")
    sys.stdout.flush()

    # Wait for termination
    stop = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    stop.wait()

    for s in servers:
        s.shutdown()


if __name__ == "__main__":
    main()
