"""CLI command for running agents."""

import json
import math
import os
import select
import subprocess
import sys
import uuid
from datetime import datetime
from pathlib import Path

import click
from rich.console import Console
from rich.markdown import Markdown
from rich.text import Text

from primordial.config import get_config
from primordial.github import GitHubResolver, GitHubResolverError, is_github_url, parse_github_url
from primordial.manifest import load_manifest
from primordial.security.key_vault import KeyVault
from primordial.security.permissions import format_permissions_for_display
from primordial.sandbox.manager import SandboxManager
from primordial.cli.helix import HelixSpinner

console = Console()


def _input_with_placeholder(prompt: str, placeholder: str) -> str:
    """Show a prompt with dim placeholder text that vanishes on first keystroke."""
    import readline  # noqa: F401 — ensures line editing works for input()
    import termios
    import tty

    # Print prompt + dim placeholder, cursor after prompt
    prompt_ansi = f"\033[1m{prompt}\033[0m"
    placeholder_ansi = f"\033[2m{placeholder}\033[0m"
    sys.stdout.write(f"{prompt_ansi}{placeholder_ansi}")
    # Move cursor back to right after the prompt
    sys.stdout.write(f"\r{prompt_ansi}")
    sys.stdout.flush()

    # Read one character in raw mode to detect first keystroke
    fd = sys.stdin.fileno()
    old_settings = termios.tcgetattr(fd)
    try:
        tty.setraw(fd)
        first = sys.stdin.read(1)
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)

    if first in ("\x03", "\x04"):  # Ctrl+C / Ctrl+D
        raise KeyboardInterrupt if first == "\x03" else EOFError

    # Clear the line and rewrite prompt + first char, then read the rest
    sys.stdout.write(f"\r\033[2K{prompt_ansi}{first}")
    sys.stdout.flush()

    # Use normal input() for the rest (with readline support)
    rest = input()
    return first + rest


def _detect_host_tz() -> str | None:
    """Detect the host machine's IANA timezone (e.g. 'America/New_York')."""
    if tz := os.environ.get("TZ"):
        return tz
    try:
        out = subprocess.run(
            ["readlink", "/etc/localtime"],
            capture_output=True, text=True, timeout=3,
        ).stdout.strip()
        if "/zoneinfo/" in out:
            return out.split("/zoneinfo/")[1]
    except Exception:
        pass
    return None


def _new_session_name() -> str:
    """Prompt for a custom session name or generate one."""
    auto_name = datetime.now().strftime("%Y%m%d-%H%M%S")
    name = click.prompt("Session name", default=auto_name).strip()
    return name or auto_name


def _pick_session(config, agent_name: str) -> Path:
    """Prompt user to create a new session or resume an existing one."""
    sessions = config.list_sessions(agent_name)

    if not sessions:
        return config.session_state_dir(agent_name, _new_session_name())

    console.print("\n[bold]Sessions[/bold]")
    console.print(f"  [dim]0)[/dim] New session")
    for i, name in enumerate(sessions, 1):
        console.print(f"  [dim]{i})[/dim] {name}")
    console.print()

    choice = click.prompt("Select session", type=int, default=0)

    if choice < 1 or choice > len(sessions):
        return config.session_state_dir(agent_name, _new_session_name())

    return config.session_state_dir(agent_name, sessions[choice - 1])


@click.command()
@click.argument("agent_path")
@click.option("--agent-read", is_flag=True, help="Primordial Protocol pipe mode (NDJSON stdin/stdout)")
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
    """Run an agent in a sandbox.

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

    # Validate required API keys from manifest and prompt for missing ones
    vault = KeyVault(config.keys_file)

    # E2B key is always required for sandbox runtime
    if not vault.get_key("e2b"):
        console.print(
            "\n[bold yellow]E2B API key required[/bold yellow]\n"
            "[dim]E2B is the sandbox provider that Primordial uses to run agents "
            "in isolated microVMs. Sign up and grab a key at https://e2b.dev/dashboard[/dim]\n"
        )
        e2b_key = click.prompt("  Paste E2B_API_KEY", hide_input=True)
        if e2b_key.strip():
            vault.add_key("e2b", e2b_key.strip())
            console.print("  [green]Stored e2b.[/green]\n")
        else:
            console.print("[red]E2B key is required to run agents.[/red]")
            raise SystemExit(1)

    # Show permissions and ask for approval
    stored_providers = {e["provider"] for e in vault.list_keys()}
    console.print(f"\n[bold]{manifest.display_name}[/bold] [dim]v{manifest.version}[/dim]")
    console.print(f"[dim]{manifest.description}[/dim]")
    console.print(f"[dim]Session: {state_dir.name}[/dim]\n")
    console.print("[bold]Permissions[/bold]\n")
    for line in format_permissions_for_display(manifest, stored_providers=stored_providers):
        console.print(f"  {line}")
    console.print()
    if not yes and not click.confirm("Approve and run?"):
        console.print("[dim]Aborted.[/dim]")
        raise SystemExit(0)

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
            console.print("[bold]Missing API keys[/bold]")
            for kr in missing_required:
                console.print(f"  [red]✗[/red] {kr.provider} [dim]({kr.resolved_env_var()})[/dim]")
            for kr in missing_optional:
                console.print(f"  [dim]○ {kr.provider} ({kr.resolved_env_var()}) — optional[/dim]")
            console.print()

            for kr in missing_required:
                key = click.prompt(
                    f"  Enter {kr.provider.upper()} API key ({kr.resolved_env_var()})",
                    hide_input=True,
                )
                if key.strip():
                    vault.add_key(kr.provider, key.strip())
                    console.print(f"  [dim]Stored {kr.provider}.[/dim]")
                else:
                    console.print(f"[red]Cannot proceed without {kr.provider} key.[/red]")
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
            console.print(
                f"\n[bold yellow]{provider.upper()} API key required[/bold yellow]\n"
                f"[dim]This agent uses {provider} as its model provider.[/dim]\n"
            )
            key = click.prompt(f"  Paste {provider.upper()} API key", hide_input=True)
            if key.strip():
                vault.add_key(provider, key.strip())
                console.print(f"  [green]Stored {provider}.[/green]\n")
            else:
                console.print(f"[red]Cannot proceed without {provider} key.[/red]")
                raise SystemExit(1)

    # Only inject keys the manifest declares — never leak unrelated keys
    if manifest.keys:
        allowed_providers = [kr.provider for kr in manifest.keys]
    else:
        allowed_providers = [manifest.runtime.default_model.provider]
    # E2B key is always needed for sandbox creation
    allowed_providers.append("e2b")
    env_vars = vault.get_env_vars(providers=allowed_providers)

    # Inject host timezone so agents see the user's local time
    if "TZ" not in env_vars:
        try:
            tz = _detect_host_tz()
            if tz:
                env_vars["TZ"] = tz
        except Exception:
            pass
    workspace = "."
    manager = SandboxManager()

    if agent_read:
        _run_json(manager, agent_dir, manifest, workspace, env_vars, state_dir)
    elif manifest.runtime.mode == "terminal":
        _run_terminal(manager, agent_dir, manifest, workspace, env_vars, state_dir)
    else:
        _run_chat(manager, agent_dir, manifest, workspace, env_vars, state_dir)


_MINI_ROWS = 3
_MINI_HALF = 3
_MINI_CENTER = 4
_MINI_WIDTH = _MINI_CENTER * 2 + 2
_MINI_SPINNER = "/-\\|"


def _mini_strand_char(dx: float, z: float) -> str:
    """Pick strand character based on visual slope and depth."""
    if abs(dx) < 0.12:
        return "|" if z > 0 else ":"
    if dx > 0:
        return "\\" if z > -0.2 else "."
    return "/" if z > -0.2 else "."


def _mini_helix_frame(phase: float) -> list[Text]:
    """Render one frame of a mini double helix (3 rows)."""
    lines = []
    for r in range(_MINI_ROWS):
        t = r * 0.7 + phase
        hx1 = _MINI_CENTER + math.sin(t) * _MINI_HALF
        hx2 = _MINI_CENTER + math.sin(t + math.pi) * _MINI_HALF
        hz1 = math.cos(t)

        x1 = int(round(hx1))
        x2 = int(round(hx2))

        dx1, dx2 = hz1 * 0.55, -hz1 * 0.55
        ch = [" "] * _MINI_WIDTH

        if abs(x1 - x2) <= 1:
            cx = min(x1, x2)
            if 0 <= cx < _MINI_WIDTH:
                front_dx = dx1 if hz1 > 0 else dx2
                ch[cx] = _mini_strand_char(front_dx, 0.5)
            ln = Text("".join(ch))
            if 0 <= cx < _MINI_WIDTH:
                ln.stylize("bright_green", cx, cx + 1)
            lines.append(ln)
            continue

        lx, rx = (x1, x2) if x1 < x2 else (x2, x1)
        lz = hz1 if x1 < x2 else -hz1
        rz = -hz1 if x1 < x2 else hz1
        ldx = dx1 if x1 < x2 else dx2
        rdx = dx2 if x1 < x2 else dx1

        if 0 <= lx < _MINI_WIDTH:
            ch[lx] = _mini_strand_char(ldx, lz)
        if 0 <= rx < _MINI_WIDTH:
            ch[rx] = _mini_strand_char(rdx, rz)

        ln = Text("".join(ch))
        for pos, z, c in [(lx, lz, "green"), (rx, rz, "cyan")]:
            if 0 <= pos < _MINI_WIDTH:
                if z > 0.2:
                    ln.stylize(f"bold bright_{c}", pos, pos + 1)
                elif z > -0.2:
                    ln.stylize(c, pos, pos + 1)
                else:
                    ln.stylize(f"dim {c}", pos, pos + 1)
        lines.append(ln)
    return lines


def _show_sub_spawn(console: Console, session, sid: str, first_status: str) -> None:
    """Show a mini helix animation while sub-agent setup events stream in."""
    import time
    from rich.console import Group
    from rich.live import Live

    current_status = first_status
    completed: list[Text] = []
    start_time = time.monotonic()
    phase_start = time.monotonic()

    def _render(frame: int) -> Group:
        helix_lines = _mini_helix_frame(frame * 0.2)

        parts: list = []
        # Header
        header = Text()
        header.append("      ")
        header.append("Spawning sub-agent", style="bold yellow")
        parts.append(header)

        # Build status lines: completed + current with live timer
        phase_elapsed = time.monotonic() - phase_start
        sp = _MINI_SPINNER[frame % len(_MINI_SPINNER)]

        status_lines: list[Text] = []
        for c in completed:
            status_lines.append(c)
        cur = Text()
        cur.append(f"{sp} ", style="cyan")
        cur.append(current_status, style="dim")
        cur.append(f" ({phase_elapsed:.1f}s)", style="dim bold")
        status_lines.append(cur)

        # Show last N status lines to keep compact
        max_visible = _MINI_ROWS
        visible = status_lines[-max_visible:]

        # Render helix rows alongside status lines
        num_rows = max(_MINI_ROWS, len(visible))
        for i in range(num_rows):
            row = Text()
            row.append("      ")
            if i < len(helix_lines):
                row.append_text(helix_lines[i])
            else:
                row.append(" " * _MINI_WIDTH)
            if i < len(visible):
                row.append("  ")
                row.append_text(visible[i])
            parts.append(row)

        return Group(*parts)

    frame = 0
    with Live(_render(frame), console=console, refresh_per_second=12, transient=True) as live:
        while True:
            msg = session.receive(timeout=0.08)
            if msg is not None:
                msg_type = msg.get("type")
                tool = msg.get("tool", "")

                if msg_type == "activity" and tool == "sub:setup":
                    # Finish current phase
                    phase_elapsed = time.monotonic() - phase_start
                    done_line = Text()
                    done_line.append("+ ", style="green")
                    done_line.append(current_status, style="dim")
                    done_line.append(f" ({phase_elapsed:.1f}s)", style="dim")
                    completed.append(done_line)
                    # Trim to keep display compact
                    if len(completed) > _MINI_ROWS:
                        completed.pop(0)
                    current_status = msg.get("description", "")
                    phase_start = time.monotonic()
                else:
                    # Non-setup event — put it back and exit
                    session._messages.put(msg)
                    break

            frame += 1
            live.update(_render(frame))

    # Print the final summary
    elapsed = time.monotonic() - start_time
    label = sid if sid else "sub-agent"
    console.print(
        f"      [yellow]› {label}:[/yellow] [dim]spawned in {elapsed:.1f}s[/dim]"
    )


def _run_terminal(
    manager: SandboxManager,
    agent_dir: Path,
    manifest,
    workspace: str,
    env_vars: dict,
    state_dir: Path | None = None,
) -> None:
    """Run an agent in terminal passthrough mode (raw PTY)."""
    import signal
    import termios
    import tty

    agent_subtitle = f"Starting {manifest.display_name} v{manifest.version}"

    # Get local terminal size
    try:
        term_size = os.get_terminal_size()
        cols, rows = term_size.columns, term_size.lines
    except OSError:
        cols, rows = 80, 24

    # Write raw PTY output directly to local stdout
    def on_data(data) -> None:
        if isinstance(data, (bytes, bytearray)):
            os.write(sys.stdout.fileno(), data)
        else:
            os.write(sys.stdout.fileno(), data.encode() if isinstance(data, str) else bytes(data))

    with HelixSpinner(console, subtitle=agent_subtitle) as spinner:
        try:
            session = manager.run_agent_terminal(
                agent_dir=agent_dir,
                manifest=manifest,
                workspace=Path(workspace).resolve(),
                env_vars=env_vars,
                cols=cols,
                rows=rows,
                on_data=on_data,
                state_dir=state_dir,
                on_status=spinner.set_phase,
            )
        except Exception as e:
            console.print(f"\n[red]Failed to start agent:[/red] {e}")
            raise SystemExit(1)

    # Save and set raw terminal mode
    fd = sys.stdin.fileno()
    old_settings = termios.tcgetattr(fd)

    # Handle terminal resize
    def handle_winch(signum, frame):
        try:
            size = os.get_terminal_size()
            session.resize(size.columns, size.lines)
        except Exception:
            pass

    old_sigwinch = signal.getsignal(signal.SIGWINCH)
    signal.signal(signal.SIGWINCH, handle_winch)

    try:
        tty.setraw(fd)

        while session.is_alive:
            # Check for local input
            ready, _, _ = select.select([sys.stdin], [], [], 0.05)
            if ready:
                data = os.read(fd, 4096)
                if not data:
                    break
                session.send_input(data)

    except (KeyboardInterrupt, EOFError):
        pass
    finally:
        # Restore terminal
        termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
        signal.signal(signal.SIGWINCH, old_sigwinch)

        # Print newline so prompt doesn't overlap
        print()
        console.print("[dim]Session ended.[/dim]")

        session.shutdown()


def _run_chat(
    manager: SandboxManager,
    agent_dir: Path,
    manifest,
    workspace: str,
    env_vars: dict,
    state_dir: Path | None = None,
) -> None:
    """Run an agent with a human-friendly chat loop."""
    agent_subtitle = f"Starting {manifest.display_name} v{manifest.version}"

    with HelixSpinner(console, subtitle=agent_subtitle) as spinner:
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
        console.print(f"[dim]{manifest.display_name} ready[/dim]\n")
        msg_counter = 0
        first_prompt = True

        while True:
            try:
                if first_prompt:
                    user_input = _input_with_placeholder("> ", "Say something...")
                    first_prompt = False
                else:
                    user_input = console.input("[bold]> [/bold]")
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
                    console.print(f"[dim]{stderr}[/dim]")
                break

            msg_counter += 1
            message_id = f"msg_{msg_counter:04d}"
            try:
                session.send_message(user_input, message_id)
            except Exception as e:
                console.print(f"[red]Send failed:[/red] {e}")
                stderr = session.stderr.strip()
                if stderr:
                    console.print(f"[dim]{stderr}[/dim]")
                break

            # Read responses until we get a done=true response
            accumulated_content = ""
            thinking = console.status("[dim]Thinking...[/dim]", spinner="flip")
            thinking.start()

            while True:
                msg = session.receive(timeout=300)
                if msg is None:
                    thinking.stop()
                    console.print("[yellow]Response timed out.[/yellow]")
                    break

                msg_type = msg.get("type")
                if msg_type == "response":
                    thinking.stop()
                    content = msg.get("content", "")
                    if content:
                        accumulated_content += content
                    if msg.get("done", False):
                        if accumulated_content:
                            console.print()
                            console.print(
                                Markdown(accumulated_content),
                                style="dim",
                            )
                            console.print()
                        break
                elif msg_type == "activity":
                    thinking.stop()
                    tool = msg.get("tool", "?")
                    desc = msg.get("description", "")
                    if tool == "sub:response":
                        sid = msg.get("session_id", "")
                        label = sid if sid else "response"
                        console.print(f"      [green]› {label}:[/green] [dim]{desc}[/dim]")
                    elif tool == "sub:setup":
                        sid = msg.get("session_id", "")
                        # Show mini spawn animation with live-updating status
                        _show_sub_spawn(console, session, sid, desc)
                        # After spawn completes, resume the thinking spinner
                    elif tool.startswith("sub:"):
                        sub_tool = tool[4:]
                        sid = msg.get("session_id", "")
                        prefix = f"{sid} › {sub_tool}" if sid else sub_tool
                        console.print(f"      [cyan]› {prefix}:[/cyan] [dim]{desc}[/dim]")
                    else:
                        console.print(f"  [dim]› {tool}: {desc}[/dim]")
                    thinking = console.status("[dim]Thinking...[/dim]", spinner="flip")
                    thinking.start()
                elif msg_type == "error":
                    thinking.stop()
                    console.print(f"  [red]Error: {msg.get('error', 'Unknown')}[/red]")
                    break

            if not session.is_alive:
                console.print("[red]Agent process exited unexpectedly.[/red]")
                stderr = session.stderr.strip()
                if stderr:
                    console.print(f"[dim]{stderr}[/dim]")
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
