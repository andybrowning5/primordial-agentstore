"""
Primordial AgentStore MCP Server — FastMCP implementation.

Exposes Primordial as a Model Context Protocol server so any MCP-compatible
host (Claude Code, Cursor, Windsurf) can discover and invoke agents without
any skill file or custom integration.

Orchestration instructions are baked into the FastMCP `instructions` parameter
and delivered to the host LLM automatically on connection.

Security:
  - All run_agent calls are assessed for trust tier before sandbox starts
  - REQUIRES_APPROVAL tier pauses execution; approve_agent continues it
  - Manifest URLs are validated for HTTPS and non-private-IP origin
  - Pending approvals expire after 5 minutes
"""

import secrets
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from fastmcp import FastMCP

from primordial.github import GitHubResolver, is_github_url, parse_github_url
from primordial.manifest import load_manifest
from primordial.sandbox.manager import AgentSession, SandboxManager
from primordial.security.manifest_safety import (
    TrustTier,
    assess_manifest_trust,
    check_url_origin,
)

try:
    from primordial.known_providers import KNOWN_PROVIDERS
except ImportError:
    KNOWN_PROVIDERS = {}  # graceful fallback during development

_APPROVAL_TTL = 300  # 5 minutes


@dataclass
class _PendingApproval:
    manifest: object
    message: str
    workspace: str
    url: str
    created_at: float = field(default_factory=time.monotonic)


mcp = FastMCP(
    name="Primordial AgentStore",
    version="2.0",
    instructions="""
Use Primordial to delegate long-running or specialized tasks to isolated,
sandboxed agents running in E2B Firecracker microVMs.

Standard workflow:
  1. search_agents(query)           — find the right agent for the task
  2. run_agent(url, message)        — spawn it with an initial task description
  3. send_message(session_id, msg)  — send follow-ups as needed
  4. stop_agent(session_id)         — stop the agent and free sandbox resources

IMPORTANT — stopping agents:
  Never call stop_agent without first asking the user if they are done with
  the session. The user may want to send more messages or resume later.
  Only stop when the user explicitly says they are finished.

Resuming sessions:
  Primordial agents persist state between runs. If the user wants to continue
  a previous session, pass the session_name to run_agent or use the --session
  flag via `primordial run`. Use get_session_status(session_id) to check if a
  session is still alive before resuming.

If run_agent returns status='requires_approval':
  - Show the user each entry in 'findings' (provider + domain).
  - If any finding has spoofing_warning=true, add: "This domain resembles a known
    AI provider's official API but is not it — this may be a spoofing attempt."
  - Ask: "Allow this agent to connect to these APIs? [y/N]"
  - Call approve_agent(pending_id, approved=True/False) based on user answer.
  - Pending approvals expire after 5 minutes.

stop_agent returns workspace_patch (unified diff of all file changes).
Tell the user: "Run `primordial apply <session_id>` to preview and apply changes."

Delegate to Primordial when: the task is long-running (>2 min), requires
specialized tools not available locally, or involves file changes the user
should review before applying.
""",
)

_manager = SandboxManager()
_sessions: dict[str, AgentSession] = {}
_pending_approvals: dict[str, _PendingApproval] = {}


def _expire_pending() -> None:
    cutoff = time.monotonic() - _APPROVAL_TTL
    expired = [k for k, v in _pending_approvals.items() if v.created_at < cutoff]
    for k in expired:
        del _pending_approvals[k]


def _resolve_manifest(url: str) -> tuple:
    """Resolve a URL or local path to (AgentManifest, agent_dir)."""
    if is_github_url(url):
        ref = parse_github_url(url)
        agent_dir = GitHubResolver().resolve(ref)
    else:
        agent_dir = Path(url)
    return load_manifest(agent_dir), agent_dir


# ── Tools ────────────────────────────────────────────────────────────────────

@mcp.tool
async def search_agents(query: str) -> list[dict]:
    """Search for available Primordial agents by capability or keyword."""
    from primordial.discovery import fetch_agents, enrich_from_cache
    agents = enrich_from_cache(fetch_agents())
    q = query.lower()
    matches = [
        a for a in agents
        if q in a["name"].lower() or q in a.get("description", "").lower()
        or any(q in t for t in a.get("topics", []))
        or any(q in p for p in a.get("providers", []))
        or q in a.get("category", "").lower()
    ] or agents  # fall back to all if no keyword match
    return [{"name": a["name"], "url": a["url"], "description": a.get("description", "")} for a in matches]


@mcp.tool
async def run_agent(url: str, message: str, workspace: str = "") -> dict:
    """
    Spawn a Primordial agent and send it an initial task message.

    Returns immediately with status='running' and session_id if the agent
    uses only known providers. Returns status='requires_approval' if any
    provider is unrecognized — call approve_agent() to proceed after
    presenting findings to the user.
    """
    _expire_pending()

    # Hard-reject unsafe URLs before fetching anything
    try:
        check_url_origin(url)
    except ValueError as e:
        return {"error": str(e)}

    # Fetch and parse manifest
    try:
        manifest, agent_dir = _resolve_manifest(url)
    except Exception as e:
        return {"error": f"Failed to load manifest: {e}"}

    # Assess trust tier
    tier, findings = assess_manifest_trust(manifest, KNOWN_PROVIDERS)

    if tier == TrustTier.AUTO:
        session_id, first_response = await _start_agent(manifest, agent_dir, message, workspace)
        result = {"status": "running", "session_id": session_id}
        if first_response:
            result["response"] = first_response
        return result

    # REQUIRES_APPROVAL — park and return findings
    pending_id = secrets.token_hex(8)
    _pending_approvals[pending_id] = _PendingApproval(
        manifest=manifest,
        message=message,
        workspace=workspace,
        url=url,
    )
    return {
        "status": "requires_approval",
        "pending_id": pending_id,
        "findings": findings,
        "expires_in_seconds": _APPROVAL_TTL,
    }


@mcp.tool
async def approve_agent(pending_id: str, approved: bool) -> dict:
    """
    Approve or reject a pending agent that requires user confirmation.
    Call this after presenting the risk findings to the user.
    """
    _expire_pending()
    entry = _pending_approvals.pop(pending_id, None)
    if entry is None:
        return {"error": "Pending session not found or expired (5-minute limit)"}
    if not approved:
        return {"status": "rejected"}
    try:
        _, agent_dir = _resolve_manifest(entry.url)
        session_id, first_response = await _start_agent(entry.manifest, agent_dir, entry.message, entry.workspace)
    except Exception as e:
        return {"error": f"Failed to start agent: {e}"}
    result = {"status": "running", "session_id": session_id}
    if first_response:
        result["response"] = first_response
    return result


@mcp.tool
async def send_message(session_id: str, message: str) -> str:
    """
    Send a follow-up message to a running agent. Returns the full response.
    Blocks until the agent responds or times out.
    """
    session = _sessions.get(session_id)
    if not session:
        return f"Error: session {session_id!r} not found"
    msg_id = secrets.token_hex(8)
    session.send_message(message, msg_id)
    # Drain activity/log events until we get the final result or error
    while True:
        reply = session.receive(timeout=600.0)
        if reply is None:
            return "Error: agent timed out"
        if reply.get("type") in ("result", "error", "response"):
            return reply.get("content") or reply.get("message") or str(reply)


@mcp.tool
async def get_session_status(session_id: str) -> dict:
    """Check if a session is alive and get its current state."""
    session = _sessions.get(session_id)
    if not session:
        return {"alive": False, "session_id": session_id}
    return {"alive": session.is_alive, "session_id": session_id}


@mcp.tool
async def stop_agent(session_id: str) -> dict:
    """
    Stop a running agent and release its sandbox.
    Returns workspace_patch (unified diff) if the agent modified files.
    Tell the user to run `primordial apply <session_id>` to review and apply.
    """
    session = _sessions.pop(session_id, None)
    if not session:
        return {"error": f"Session {session_id!r} not found"}
    patch = session.shutdown()
    result: dict = {"ok": True, "session_id": session_id}
    if patch:
        result["workspace_patch"] = patch.decode(errors="replace")
        result["apply_hint"] = f"primordial apply {session_id}"
    return result


async def _start_agent(manifest, agent_dir: Path, message: str, workspace: str) -> tuple[str, Optional[str]]:
    """Internal: start the sandbox, send first message, wait for first response.

    Returns (session_id, first_response). first_response is None if no message was given.
    """
    from primordial.config import get_config
    from primordial.security.key_vault import KeyVault

    config = get_config()
    vault = KeyVault(config.keys_file)
    # Include agent provider keys + E2B (always needed for sandbox creation)
    allowed_providers = [k.provider for k in manifest.keys] or [manifest.runtime.default_provider]
    allowed_providers.append("e2b")
    env_vars = vault.get_env_vars(providers=allowed_providers)
    session_name = f"mcp-{secrets.token_hex(6)}"
    state_dir = config.session_state_dir(manifest.name, session_name)

    workspace_path = Path(workspace) if workspace else None
    session = _manager.run_agent(
        agent_dir=agent_dir,
        manifest=manifest,
        workspace=workspace_path,
        env_vars=env_vars,
        state_dir=state_dir,
    )
    session.wait_ready(timeout=120)

    session_id = secrets.token_hex(8)
    session._session_id = session_id
    _sessions[session_id] = session

    first_response: Optional[str] = None
    if message:
        msg_id = secrets.token_hex(8)
        session.send_message(message, msg_id)
        # Drain activity/log events until we get the final result or error
        while True:
            reply = session.receive(timeout=600.0)
            if reply is None:
                break
            if reply.get("type") in ("result", "error", "response"):
                first_response = reply.get("content") or reply.get("message") or str(reply)
                break

    return session_id, first_response
