"""CLI commands for browsing and searching agents."""

from pathlib import Path

import click
from rich.console import Console

from agentstore.config import get_config
from agentstore.manifest import load_manifest
from agentstore.security.permissions import PermissionManager

console = Console()


@click.command()
@click.option("--category", "-c", default=None, help="Filter by category")
@click.option(
    "--sort", "-s", type=click.Choice(["popular", "recent", "rating"]), default="popular"
)
@click.option("--limit", "-n", default=20, help="Number of results")
def browse(category: str | None, sort: str, limit: int):
    """Browse available agents in the store."""
    console.print("[dim]Agent browsing requires backend connection.[/dim]")
    console.print("[dim]Use 'agentstore search <query>' to search locally installed agents.[/dim]")


@click.command()
@click.argument("query")
@click.option("--category", "-c", default=None, help="Filter by category")
def search(query: str, category: str | None):
    """Search for agents by name or description."""
    console.print(f"[dim]Searching for '{query}'...[/dim]")
    console.print("[dim]Search requires backend connection. Coming soon.[/dim]")


@click.command()
@click.argument("agent_name")
def info(agent_name: str):
    """Show detailed information about an agent."""
    config = get_config()

    agent_dir = Path(agent_name)
    if not agent_dir.exists():
        agent_dir = config.agents_dir / agent_name

    if not agent_dir.exists():
        console.print(f"[red]Agent not found:[/red] {agent_name}")
        raise SystemExit(1)

    try:
        manifest = load_manifest(agent_dir)
    except (FileNotFoundError, ValueError) as e:
        console.print(f"[red]Invalid agent:[/red] {e}")
        raise SystemExit(1)

    console.print(f"\n[bold]{manifest.display_name}[/bold] v{manifest.version}")
    console.print(f"[dim]{manifest.description}[/dim]")
    console.print(
        f"\nAuthor: {manifest.author.name}"
        + (f" (@{manifest.author.github})" if manifest.author.github else "")
    )
    console.print(f"Category: {manifest.category}")
    console.print(f"Tags: {', '.join(manifest.tags)}")
    console.print(f"Language: {manifest.runtime.language}")
    console.print(
        f"Default model: {manifest.runtime.default_model.provider}:{manifest.runtime.default_model.model}"
    )

    console.print("\n[bold]Permissions:[/bold]")
    perm_mgr = PermissionManager(config.agents_dir)
    for line in perm_mgr.format_permissions_for_display(manifest):
        console.print(f"  {line}")
    console.print()
