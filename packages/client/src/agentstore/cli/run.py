"""CLI command for running agents."""

import json
import sys
import threading
import time
import uuid
from pathlib import Path

import click
from rich.console import Console
from rich.live import Live
from rich.text import Text

from agentstore.config import get_config
from agentstore.github import GitHubResolver, GitHubResolverError, is_github_url, parse_github_url
from agentstore.manifest import load_manifest
from agentstore.security.key_vault import KeyVault
from agentstore.security.permissions import format_permissions_for_display
from agentstore.sandbox.manager import SandboxManager

console = Console()


class SetupTimer:
    """Live elapsed timer for sandbox setup phases."""

    SPINNER_CHARS = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"

    def __init__(self, console: Console):
        self._console = console
        self._current_phase = ""
        self._phase_start = 0.0
        self._total_start = 0.0
        self._live = Live(console=console, refresh_per_second=10)
        self._running = False
        self._tick = 0
        self._thread: threading.Thread | None = None
        self._completed_phases: list[tuple[str, float]] = []

    def start(self) -> None:
        self._total_start = time.monotonic()
        self._running = True
        self._live.start()
        self._thread = threading.Thread(target=self._update_loop, daemon=True)
        self._thread.start()

    def set_phase(self, phase: str) -> None:
        now = time.monotonic()
        if self._current_phase:
            elapsed = now - self._phase_start
            self._completed_phases.append((self._current_phase, elapsed))
            check = Text()
            check.append("  ✓ ", style="green")
            check.append(self._current_phase, style="dim")
            check.append(f" ({elapsed:.1f}s)", style="dim")
            self._live.update(check)
            self._live.refresh()
            self._console.print(check)
        self._current_phase = phase
        self._phase_start = now

    def _update_loop(self) -> None:
        while self._running:
            self._tick += 1
            if self._current_phase:
                elapsed = time.monotonic() - self._phase_start
                spinner = self.SPINNER_CHARS[self._tick % len(self.SPINNER_CHARS)]
                line = Text()
                line.append(f"  {spinner} ", style="cyan")
                line.append(self._current_phase, style="dim")
                line.append(f" ({elapsed:.1f}s)", style="dim bold")
                self._live.update(line)
            time.sleep(0.1)

    def stop(self) -> None:
        now = time.monotonic()
        self._running = False
        if self._current_phase:
            elapsed = now - self._phase_start
            self._completed_phases.append((self._current_phase, elapsed))
            check = Text()
            check.append("  ✓ ", style="green")
            check.append(self._current_phase, style="dim")
            check.append(f" ({elapsed:.1f}s)", style="dim")
            self._live.update(check)
            self._live.refresh()
            self._console.print(check)
        self._live.stop()
        total = now - self._total_start
        self._console.print(f"  [dim]Setup complete in {total:.1f}s[/dim]\n")


@click.command()
@click.argument("agent_path")
@click.option("--workspace", "-w", default=".", help="Workspace directory to mount")
@click.option("--model", "-m", default=None, help="Override model (provider:model format)")
@click.option("--timeout", default=None, type=int, help="Timeout in seconds")
@click.option("--json-io", is_flag=True, help="JSON pipe mode (NDJSON stdin/stdout)")
@click.option("--ref", default=None, help="Git ref (branch, tag, commit) for GitHub agents")
@click.option("--refresh", is_flag=True, help="Force re-fetch of GitHub agent (ignore cache)")
@click.option("--yes", "-y", is_flag=True, help="Skip approval prompt")
def run(
    agent_path: str,
    workspace: str,
    model: str | None,
    timeout: int | None,
    json_io: bool,
    ref: str | None,
    refresh: bool,
    yes: bool,
):
    """Run an agent from a local path, installed name, or GitHub URL.

    AGENT_PATH can be:
      - A local directory (./my-agent)
      - An installed agent name
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

    # Compute state directory
    state_dir = config.agent_state_dir(manifest.name)

    # Show permissions and ask for approval
    console.print(f"\n[bold]Agent: {manifest.display_name}[/bold] v{manifest.version}")
    console.print(f"[dim]{manifest.description}[/dim]")
    console.print(f"[dim]State: {state_dir}[/dim]\n")
    console.print("[yellow]This agent requests the following permissions:[/yellow]\n")
    for line in format_permissions_for_display(manifest):
        console.print(f"  {line}")
    console.print()
    if not yes and not click.confirm("Approve and run?"):
        console.print("[dim]Aborted.[/dim]")
        raise SystemExit(0)

    # Get API keys
    vault = KeyVault(config.keys_file)
    provider = manifest.runtime.default_model.provider
    if model:
        provider = model.split(":")[0] if ":" in model else provider

    api_key = vault.get_key(provider)
    if not api_key:
        console.print(f"[red]No API key found for provider '{provider}'.[/red]")
        console.print(f"Add one with: agentstore keys add {provider} <your-key>")
        raise SystemExit(1)

    env_vars = vault.get_env_vars([provider])
    manager = SandboxManager()

    if json_io:
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

    timer = SetupTimer(console)
    timer.start()

    def _status(msg: str) -> None:
        timer.set_phase(msg)

    try:
        session = manager.run_agent(
            agent_dir=agent_dir,
            manifest=manifest,
            workspace=Path(workspace).resolve(),
            env_vars=env_vars,
            state_dir=state_dir,
            on_status=_status,
        )
    except Exception as e:
        timer.stop()
        console.print(f"[red]Failed to start agent:[/red] {e}")
        raise SystemExit(1)

    try:
        timer.set_phase("Waiting for agent to initialize...")
        if not session.wait_ready(timeout=120):
            timer.stop()
            console.print("[red]Agent failed to start (no ready signal)[/red]")
            raise SystemExit(1)

        timer.stop()
        console.print("[green]Agent ready.[/green]\n")
        msg_counter = 0

        while True:
            try:
                user_input = console.input("[bold cyan]You:[/bold cyan] ")
            except (EOFError, KeyboardInterrupt):
                console.print("\n[dim]Ending session...[/dim]")
                break

            if user_input.strip().lower() in ("exit", "quit", "/exit", "/quit"):
                console.print("[dim]Ending session...[/dim]")
                break

            if not user_input.strip():
                continue

            msg_counter += 1
            message_id = f"msg_{msg_counter:04d}"
            session.send_message(user_input, message_id)

            # Read responses until we get a done=true response
            while True:
                msg = session.receive(timeout=manifest.runtime.resources.max_duration)
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
                    msg = session.receive(timeout=manifest.runtime.resources.max_duration)
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
