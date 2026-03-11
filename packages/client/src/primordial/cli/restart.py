"""CLI command to restart the Primordial background daemon."""

import os
import platform
import subprocess
import sys

import click
from rich.console import Console

console = Console()

_LAUNCHD_LABEL = "com.primordial.daemon"


@click.command()
def restart():
    """Restart the Primordial background daemon.

    Useful after upgrading: pip install --upgrade primordial-agentstore && primordial restart
    """
    if platform.system() == "Windows":
        console.print("[yellow]The restart command uses macOS launchd and is not supported on Windows.[/yellow]")
        console.print("Run the daemon manually: [bold]primordial serve[/bold]")
        raise SystemExit(1)

    uid = os.getuid()
    domain_target = f"gui/{uid}/{_LAUNCHD_LABEL}"

    # Check if the service is loaded in launchd
    check = subprocess.run(
        ["launchctl", "print", domain_target],
        capture_output=True, text=True,
    )
    if check.returncode != 0:
        console.print("[yellow]Daemon service not found in launchd.[/yellow]")
        console.print("Start it with: [bold]primordial serve[/bold]")
        console.print("Or install the service: [bold]primordial install --claude[/bold]")
        raise SystemExit(1)

    # kickstart -k kills the running process and restarts it immediately
    result = subprocess.run(
        ["launchctl", "kickstart", "-k", domain_target],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        console.print(f"[red]Restart failed: {result.stderr.strip()}[/red]")
        raise SystemExit(1)

    console.print("[green]Daemon restarted.[/green]")
