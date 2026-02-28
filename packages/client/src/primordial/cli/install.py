"""One-command setup for host agent integration."""

import os
import secrets
import shutil
import subprocess
import sys
from pathlib import Path

import click
from rich.console import Console

console = Console()

_PLIST_LABEL = "com.primordial.daemon"
_PLIST_DIR = Path.home() / "Library" / "LaunchAgents"
_PLIST_PATH = _PLIST_DIR / f"{_PLIST_LABEL}.plist"
_PASSWORD_FILE = Path.home() / ".primordial-password"
_TOKEN_FILE = Path.home() / ".primordial-daemon-token"
_WRAPPER_DIR = Path.home() / ".local" / "bin"
_WRAPPER_PATH = _WRAPPER_DIR / "primordial"
_LOG_PATH = Path("/tmp/primordial-daemon.log")

# Skill file source (bundled inside the primordial package)
_SKILL_DIR = Path(__file__).resolve().parent.parent / "skills"

_OPENCLAW_SKILL_DEST = Path.home() / ".openclaw" / "workspace" / "skills" / "primordial"
_CLAUDE_SKILL_DEST = Path.home() / ".claude" / "skills" / "primordial"


def _find_real_binary() -> str:
    """Find the real primordial binary path."""
    result = subprocess.run(
        ["which", "primordial"], capture_output=True, text=True
    )
    path = result.stdout.strip()
    if path and Path(path).exists():
        # If it's already our wrapper, find the pip-installed one
        if path == str(_WRAPPER_PATH):
            # Search PATH excluding our wrapper dir
            env = os.environ.copy()
            path_dirs = [
                d for d in env.get("PATH", "").split(":")
                if d != str(_WRAPPER_DIR)
            ]
            env["PATH"] = ":".join(path_dirs)
            result = subprocess.run(
                ["which", "primordial"], capture_output=True, text=True, env=env
            )
            return result.stdout.strip()
        return path
    return "primordial"


def _get_or_create_password() -> tuple[str, bool]:
    """Read existing vault password or generate a new one.

    Returns (password, created) where created is True if a new password was generated.
    """
    if _PASSWORD_FILE.exists():
        return _PASSWORD_FILE.read_text().strip(), False
    password = secrets.token_urlsafe(32)
    _PASSWORD_FILE.write_text(password)
    _PASSWORD_FILE.chmod(0o600)
    return password, True


def _create_wrapper(real_binary: str, password: str):
    """Create a wrapper script that sets vault password before exec.

    Skips if the wrapper already exists with the same binary path.
    """
    if _WRAPPER_PATH.exists():
        existing = _WRAPPER_PATH.read_text()
        if f'exec "{real_binary}"' in existing and f"'{password}'" in existing:
            return False  # No change needed

    _WRAPPER_DIR.mkdir(parents=True, exist_ok=True)
    script = f"""#!/bin/sh
export PRIMORDIAL_VAULT_PASSWORD='{password}'
exec "{real_binary}" "$@"
"""
    _WRAPPER_PATH.write_text(script)
    _WRAPPER_PATH.chmod(0o755)
    return True


def _build_plist() -> str:
    """Build the plist XML content."""
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>{_PLIST_LABEL}</string>
  <key>ProgramArguments</key><array>
    <string>{_WRAPPER_PATH}</string>
    <string>serve</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardErrorPath</key><string>{_LOG_PATH}</string>
</dict>
</plist>
"""


def _create_plist():
    """Install launchd plist for auto-starting the daemon.

    Only reloads if the plist content actually changed.
    """
    _PLIST_DIR.mkdir(parents=True, exist_ok=True)
    new_content = _build_plist()

    if _PLIST_PATH.exists():
        existing = _PLIST_PATH.read_text()
        if existing == new_content:
            return False  # No change needed

        subprocess.run(
            ["launchctl", "unload", str(_PLIST_PATH)],
            capture_output=True,
        )

    _PLIST_PATH.write_text(new_content)
    subprocess.run(["launchctl", "load", str(_PLIST_PATH)], check=True)
    return True


def _install_skill(name: str, dest: Path, source_name: str):
    """Copy a skill file to the destination."""
    source = _SKILL_DIR / source_name
    if not source.exists():
        console.print(f"  [yellow]Skill file not found: {source_name}[/yellow]")
        return
    dest.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, dest / "SKILL.md")
    console.print(f"  [green]Installed {name} skill →[/green] {dest / 'SKILL.md'}")


def _prompt_e2b_key():
    """Check if e2b key exists in vault; prompt if missing."""
    from primordial.config import get_config
    from primordial.security.key_vault import KeyVault

    config = get_config()
    vault = KeyVault(config.keys_file)

    if vault.get_key("e2b"):
        console.print("  [dim]e2b key already configured.[/dim]")
        return

    console.print()
    console.print("  [bold]The E2B API key is required to run agents.[/bold]")
    console.print("  [dim]Get one free at https://e2b.dev/dashboard[/dim]")
    console.print()

    key = click.prompt(
        "  Paste your E2B API key (Enter to skip)",
        default="",
        show_default=False,
        hide_input=True,
    ).strip()

    if key:
        vault.add_key("e2b", key)
        console.print("  [green]Stored e2b key.[/green]")
    else:
        console.print("  [yellow]Skipped. Run 'primordial setup' later to add it.[/yellow]")


@click.command()
@click.option("--openclaw", is_flag=True, help="Install for OpenClaw")
@click.option("--claude", is_flag=True, help="Install for Claude Code")
@click.option("--codex", is_flag=True, help="Install for Codex CLI")
@click.option("--all", "install_all", is_flag=True, help="Install for all hosts")
def install(openclaw: bool, claude: bool, codex: bool, install_all: bool):
    """Install Primordial for host agent integration.

    Sets up vault password, wrapper script, launchd daemon, and skill files.
    Safe to run multiple times — won't destroy existing keys or config.
    """
    if not any([openclaw, claude, codex, install_all]):
        console.print("[yellow]Specify a target: --openclaw, --claude, --codex, or --all[/yellow]")
        raise SystemExit(1)

    if install_all:
        openclaw = claude = codex = True

    real_binary = _find_real_binary()
    console.print(f"[dim]Found primordial at: {real_binary}[/dim]")

    # 1. Vault password (idempotent)
    console.print("\n[bold]1.[/bold] Vault password...")
    password, created = _get_or_create_password()
    if created:
        console.print(f"  [green]Generated →[/green] {_PASSWORD_FILE}")
    else:
        console.print(f"  [dim]Already exists →[/dim] {_PASSWORD_FILE}")

    # 2. Wrapper script (idempotent)
    console.print("[bold]2.[/bold] Wrapper script...")
    changed = _create_wrapper(real_binary, password)
    if changed:
        console.print(f"  [green]Created →[/green] {_WRAPPER_PATH}")
    else:
        console.print(f"  [dim]Already up to date →[/dim] {_WRAPPER_PATH}")

    # 3. Launchd daemon (idempotent)
    if sys.platform == "darwin":
        console.print("[bold]3.[/bold] Launchd daemon...")
        changed = _create_plist()
        if changed:
            console.print(f"  [green]Loaded →[/green] {_PLIST_PATH}")
        else:
            console.print(f"  [dim]Already up to date →[/dim] {_PLIST_PATH}")
    else:
        console.print("[bold]3.[/bold] [dim]Skipping launchd (not macOS)[/dim]")

    # 4. Skill files
    console.print("[bold]4.[/bold] Installing skill files...")
    if openclaw:
        _install_skill("OpenClaw", _OPENCLAW_SKILL_DEST, "SKILL-openclaw.md")
    if claude:
        _install_skill("Claude Code", _CLAUDE_SKILL_DEST, "SKILL-claude.md")
    if codex:
        codex_dest = Path.home() / ".codex"
        codex_dest.mkdir(parents=True, exist_ok=True)
        source = _SKILL_DIR / "SKILL-codex.md"
        if source.exists():
            # Append to AGENTS.md
            agents_md = codex_dest / "AGENTS.md"
            content = source.read_text()
            if agents_md.exists():
                existing = agents_md.read_text()
                if "Primordial AgentStore" not in existing:
                    agents_md.write_text(existing + "\n\n" + content)
                    console.print(f"  [green]Appended Codex skill →[/green] {agents_md}")
                else:
                    console.print(f"  [dim]Codex skill already present in {agents_md}[/dim]")
            else:
                agents_md.write_text(content)
                console.print(f"  [green]Created Codex skill →[/green] {agents_md}")
        else:
            console.print(f"  [yellow]Skill file not found: SKILL-codex.md[/yellow]")

    # 5. E2B key prompt
    console.print("[bold]5.[/bold] Checking API keys...")
    _prompt_e2b_key()

    console.print(f"\n[bold green]Done![/bold green] Primordial is ready.")
    console.print(f"[dim]Daemon log: {_LOG_PATH}[/dim]")
