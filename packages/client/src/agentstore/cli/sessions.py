"""CLI commands for managing agent sessions."""

from __future__ import annotations

from pathlib import Path

import click
from rich.console import Console
from rich.table import Table

from agentstore.config import get_config
from agentstore.github import GitHubResolver, GitHubResolverError, is_github_url, parse_github_url
from agentstore.manifest import load_manifest

console = Console()


def _resolve_agent_name(agent_path: str) -> str:
    """Resolve an agent path (local dir, GitHub URL, or bare name) to its manifest name."""
    config = get_config()

    if is_github_url(agent_path):
        try:
            github_ref = parse_github_url(agent_path)
            resolver = GitHubResolver()
            agent_dir = resolver.resolve(github_ref)
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
                # Treat as a bare agent name (already resolved)
                return agent_path

    try:
        manifest = load_manifest(agent_dir)
        return manifest.name
    except (FileNotFoundError, ValueError):
        # Fall back to using the raw input
        return agent_path


@click.command()
@click.argument("agent_path")
def sessions(agent_path: str):
    """Manage sessions for an agent.

    AGENT_PATH can be a local directory, a GitHub URL, or an agent name.

    \b
    Examples:
      agentstore sessions gus
      agentstore sessions ./my-agent
      agentstore sessions https://github.com/user/repo
    """
    agent_name = _resolve_agent_name(agent_path)
    config = get_config()
    session_list = config.list_sessions(agent_name)

    if not session_list:
        console.print(f"[dim]No sessions found for '{agent_name}'.[/dim]")
        return

    table = Table(title=f"Sessions for {agent_name}", border_style="cyan")
    table.add_column("#", style="cyan", width=4)
    table.add_column("Session", style="bold")
    for i, name in enumerate(session_list, 1):
        table.add_row(str(i), name)
    console.print(table)
    console.print()

    choice = click.prompt(
        "Enter session numbers to delete (e.g. 1,3,5), or Enter to cancel",
        default="",
        show_default=False,
    ).strip()

    if not choice:
        return

    # Parse comma-separated numbers
    to_delete: list[str] = []
    for part in choice.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            num = int(part)
        except ValueError:
            console.print(f"[red]Skipping invalid input: '{part}'[/red]")
            continue
        if 1 <= num <= len(session_list):
            to_delete.append(session_list[num - 1])
        else:
            console.print(f"[red]Skipping out of range: {num}[/red]")

    if not to_delete:
        console.print("[dim]Nothing to delete.[/dim]")
        return

    console.print(f"\n[yellow]Will delete {len(to_delete)} session(s):[/yellow]")
    for name in to_delete:
        console.print(f"  - {name}")
    console.print()

    if not click.confirm("This cannot be undone. Continue?"):
        console.print("[dim]Cancelled.[/dim]")
        return

    for name in to_delete:
        config.delete_session(agent_name, name)
        console.print(f"  [green]Deleted '{name}'[/green]")

    console.print(f"\n[bold green]Done.[/bold green] {len(to_delete)} session(s) deleted.")
