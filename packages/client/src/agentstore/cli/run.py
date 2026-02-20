"""CLI command for running agents."""

import json
import select
import sys
import uuid
from datetime import datetime
from pathlib import Path

import click
from rich.console import Console

from agentstore.config import get_config
from agentstore.github import GitHubResolver, GitHubResolverError, is_github_url, parse_github_url
from agentstore.manifest import load_manifest
from agentstore.security.key_vault import KeyVault
from agentstore.security.permissions import format_permissions_for_display
from agentstore.sandbox.manager import SandboxManager
from agentstore.cli.helix import HelixSpinner

console = Console()


def _pick_session(config, agent_name: str) -> Path:
    """Prompt user to create a new session or resume an existing one."""
    sessions = config.list_sessions(agent_name)

    if not sessions:
        # First time — create default session silently
        session_name = datetime.now().strftime("%Y%m%d-%H%M%S")
        return config.session_state_dir(agent_name, session_name)

    console.print("\n[bold]Sessions:[/bold]")
    console.print(f"  [cyan]0)[/cyan] New session")
    for i, name in enumerate(sessions, 1):
        console.print(f"  [cyan]{i})[/cyan] {name}")
    console.print()

    choice = click.prompt("Select session", type=int, default=0)

    if choice == 0 or choice > len(sessions):
        session_name = datetime.now().strftime("%Y%m%d-%H%M%S")
        return config.session_state_dir(agent_name, session_name)

    return config.session_state_dir(agent_name, sessions[choice - 1])


@click.command()
@click.argument("agent_path")
@click.option("--agent-read", is_flag=True, help="Ooze Protocol pipe mode (NDJSON stdin/stdout)")
@click.option("--ref", default=None, help="Git ref (branch, tag, commit) for GitHub agents")
@click.option("--refresh", is_flag=True, help="Force re-fetch of GitHub agent (ignore cache)")
@click.option("--yes", "-y", is_flag=True, help="Skip approval prompt")
@click.option("--session", "session_name", default=None, help="Session name to resume (skips prompt)")
def run(
    agent_path: str,
    agent_read: bool,
    ref: str | None,
    refresh: bool,
    yes: bool,
    session_name: str | None,
):
    """Run an agent in a Primordial sandbox.

    AGENT_PATH can be:
      - A local directory (./my-agent)
      - A GitHub URL (https://github.com/user/repo)
    """
    config = get_config()

    # Resolve agent path — GitHub URL, local path, or installed name
    if is_github_url(agent_path):
        try:
            github_ref = parse_github_url(agent_path, ref_override=ref)
            console.print(f"[dim]Resolving: {github_ref}[/dim]")
            resolver = GitHubResolver()
            agent_dir = resolver.resolve(github_ref, force_refresh=refresh)
        except GitHubResolverError as e:
            console.print(f"[red]GitHub resolve failed:[/red] {e}")
            raise SystemExit(1)
    else:
        agent_dir = Path(agent_path)
        if not agent_dir.exists():
            installed = config.agents_dir / agent_path
            if installed.exists():
                agent_dir = installed
            else:
                console.print(f"[red]Agent not found:[/red] {agent_path}")
                raise SystemExit(1)

    # Load manifest
    try:
        manifest = load_manifest(agent_dir)
    except (FileNotFoundError, ValueError) as e:
        console.print(f"[red]Invalid agent:[/red] {e}")
        raise SystemExit(1)

    # Session selection
    if session_name:
        state_dir = config.session_state_dir(manifest.name, session_name)
    elif agent_read:
        # Pipe mode — auto-create session
        state_dir = config.session_state_dir(
            manifest.name, datetime.now().strftime("%Y%m%d-%H%M%S")
        )
    else:
        state_dir = _pick_session(config, manifest.name)

    # Show permissions and ask for approval
    console.print(f"\n[bold]Agent: {manifest.display_name}[/bold] v{manifest.version}")
    console.print(f"[dim]{manifest.description}[/dim]")
    console.print(f"[dim]Session: {state_dir.name}[/dim]\n")
    console.print("[yellow]This agent requests the following permissions:[/yellow]\n")
    for line in format_permissions_for_display(manifest):
        console.print(f"  {line}")
    console.print()
    if not yes and not click.confirm("Approve and run?"):
        console.print("[dim]Aborted.[/dim]")
        raise SystemExit(0)

    # Validate required API keys from manifest and prompt for missing ones
    vault = KeyVault(config.keys_file)

    if manifest.keys:
        missing_required = []
        missing_optional = []
        for key_req in manifest.keys:
            if not vault.get_key(key_req.provider):
                if key_req.required:
                    missing_required.append(key_req)
                else:
                    missing_optional.append(key_req)

        if missing_required:
            console.print("[yellow]This agent requires API keys that are not yet stored:[/yellow]")
            for kr in missing_required:
                console.print(f"  [red]✗[/red] {kr.provider} ({kr.resolved_env_var()}) — required")
            for kr in missing_optional:
                console.print(f"  [dim]○[/dim] {kr.provider} ({kr.resolved_env_var()}) — optional, missing")
            console.print()

            for kr in missing_required:
                key = click.prompt(
                    f"  Enter {kr.provider.upper()} API key ({kr.resolved_env_var()})",
                    hide_input=True,
                )
                if key.strip():
                    vault.add_key(kr.provider, key.strip())
                    console.print(f"  [green]Stored {kr.provider}.[/green]")
                else:
                    console.print(f"[red]Cannot proceed without required key: {kr.provider}[/red]")
                    raise SystemExit(1)
            console.print()

        if missing_optional:
            for kr in missing_optional:
                console.print(f"  [dim]Optional key missing: {kr.provider} ({kr.resolved_env_var()})[/dim]")
    else:
        # Fallback: check the model provider key exists
        provider = manifest.runtime.default_model.provider

        api_key = vault.get_key(provider)
        if not api_key:
            console.print(f"[red]No API key found for provider '{provider}'.[/red]")
            console.print(f"Add one with: [cyan]agentstore keys add {provider} <your-key>[/cyan]")
            console.print(f"Or run: [cyan]agentstore setup[/cyan]")
            raise SystemExit(1)

    env_vars = vault.get_env_vars()  # inject all stored keys
    workspace = "."
    manager = SandboxManager()

    if agent_read:
        _run_json(manager, agent_dir, manifest, workspace, env_vars, state_dir)
    else:
        _run_chat(manager, agent_dir, manifest, workspace, env_vars, state_dir)


def _run_chat(
    manager: SandboxManager,
    agent_dir: Path,
    manifest,
    workspace: str,
    env_vars: dict,
    state_dir: Path | None = None,
) -> None:
    """Run an agent with a human-friendly chat loop."""
    console.print(f"\n[bold]Starting {manifest.display_name}[/bold] v{manifest.version}")
    console.print(f"[dim]Type 'exit' or Ctrl+C to quit[/dim]\n")

    with HelixSpinner(console) as spinner:
        try:
            session = manager.run_agent(
                agent_dir=agent_dir,
                manifest=manifest,
                workspace=Path(workspace).resolve(),
                env_vars=env_vars,
                state_dir=state_dir,
                on_status=spinner.set_phase,
            )
        except Exception as e:
            console.print(f"\n[red]Failed to start agent:[/red] {e}")
            raise SystemExit(1)

        spinner.set_phase("Waiting for agent to initialize...")
        if not session.wait_ready(timeout=120):
            console.print("\n[red]Agent failed to start (no ready signal)[/red]")
            stderr = session.stderr.strip()
            if stderr:
                console.print(f"[red]Agent stderr:[/red]\n{stderr}")
            session.shutdown()
            raise SystemExit(1)

    try:
        console.print("[green]Agent ready.[/green]\n")
        msg_counter = 0

        while True:
            try:
                user_input = console.input("[bold cyan]You:[/bold cyan] ")
            except (EOFError, KeyboardInterrupt):
                console.print("\n[dim]Ending session...[/dim]")
                break

            # Buffer pasted multi-line input: if more lines arrive
            # within a short window they're part of the same paste.
            paste_lines = [user_input]
            while True:
                ready, _, _ = select.select([sys.stdin], [], [], 0.05)
                if not ready:
                    break
                extra = sys.stdin.readline()
                if not extra:
                    break
                paste_lines.append(extra.rstrip("\n"))
            user_input = "\n".join(paste_lines)

            if user_input.strip().lower() in ("exit", "quit", "/exit", "/quit"):
                console.print("[dim]Ending session...[/dim]")
                break

            if not user_input.strip():
                continue

            if not session.is_alive:
                console.print("[red]Agent process exited unexpectedly.[/red]")
                stderr = session.stderr.strip()
                if stderr:
                    console.print(f"[red]Agent stderr:[/red]\n{stderr}")
                break

            msg_counter += 1
            message_id = f"msg_{msg_counter:04d}"
            try:
                session.send_message(user_input, message_id)
            except Exception as e:
                console.print(f"[red]Failed to send message:[/red] {e}")
                stderr = session.stderr.strip()
                if stderr:
                    console.print(f"[red]Agent stderr:[/red]\n{stderr}")
                break

            # Read responses until we get a done=true response
            while True:
                msg = session.receive(timeout=300)
                if msg is None:
                    console.print("[yellow]Agent response timed out.[/yellow]")
                    break

                msg_type = msg.get("type")
                if msg_type == "response":
                    content = msg.get("content", "")
                    if content:
                        console.print(f"[bold green]{manifest.display_name}:[/bold green] {content}")
                    if msg.get("done", False):
                        break
                elif msg_type == "activity":
                    tool = msg.get("tool", "?")
                    desc = msg.get("description", "")
                    console.print(f"  [dim][{tool}] {desc}[/dim]")
                elif msg_type == "error":
                    console.print(f"  [red]Error: {msg.get('error', 'Unknown')}[/red]")
                    break

            if not session.is_alive:
                console.print("[red]Agent process exited unexpectedly.[/red]")
                stderr = session.stderr.strip()
                if stderr:
                    console.print(f"[red]Agent stderr:[/red]\n{stderr}")
                break

    finally:
        session.shutdown()
        console.print("[dim]Session ended.[/dim]")


def _run_json(
    manager: SandboxManager,
    agent_dir: Path,
    manifest,
    workspace: str,
    env_vars: dict,
    state_dir: Path | None = None,
) -> None:
    """Run an agent with JSON pipe I/O (for agent-to-agent)."""
    session = manager.run_agent(
        agent_dir=agent_dir,
        manifest=manifest,
        workspace=Path(workspace).resolve(),
        env_vars=env_vars,
        state_dir=state_dir,
    )

    try:
        if not session.wait_ready(timeout=120):
            _json_line({"type": "error", "error": "Agent failed to start"})
            raise SystemExit(1)

        _json_line({"type": "ready"})

        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                incoming = json.loads(line)
            except json.JSONDecodeError:
                continue

            msg_type = incoming.get("type")
            if msg_type == "shutdown":
                break

            if msg_type == "message":
                content = incoming.get("content", "")
                message_id = incoming.get("message_id", f"auto_{uuid.uuid4().hex[:8]}")
                session.send_message(content, message_id)

                while True:
                    msg = session.receive(timeout=300)
                    if msg is None:
                        _json_line({"type": "error", "error": "timeout", "message_id": message_id})
                        break
                    _json_line(msg)
                    if msg.get("type") == "response" and msg.get("done", False):
                        break
                    if msg.get("type") == "error":
                        break

            if not session.is_alive:
                _json_line({"type": "error", "error": "Agent process exited"})
                break

    finally:
        session.shutdown()


def _json_line(data: dict) -> None:
    """Write a single NDJSON line to stdout."""
    sys.stdout.write(json.dumps(data) + "\n")
    sys.stdout.flush()
