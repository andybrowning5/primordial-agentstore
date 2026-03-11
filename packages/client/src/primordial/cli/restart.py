"""CLI command to restart the Primordial background daemon."""

import os
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
