"""CLI command for searching primordial-agent repos on GitHub."""

import json as json_mod

import click
from rich.console import Console
from rich.table import Table

from primordial.discovery import fetch_agents

console = Console()


@click.command()
@click.argument("query", required=False, default=None)
@click.option("--agent", "as_agent", is_flag=True, help="Output results as JSON for host agents.")
def search(query: str | None, as_agent: bool = False):
    """Search for Primordial agents on GitHub."""
    if as_agent:
        try:
            agents = fetch_agents(query)
        except Exception as e:
            click.echo(json_mod.dumps({"error": str(e)}))
            raise SystemExit(1)
        click.echo(json_mod.dumps(agents))
        return

    with console.status("[bold green]Searching GitHub..."):
        try:
            agents = fetch_agents(query)
        except Exception as e:
            console.print(f"[red]GitHub API error: {e}[/red]")
            return

    if not agents:
        console.print("[yellow]No agents found.[/yellow]")
        return

    table = Table(title="Primordial Agents")
    table.add_column("#", style="dim", width=3)
    table.add_column("Name", style="cyan")
    table.add_column("Description", max_width=50)
    table.add_column("Stars", justify="right", style="yellow")
    table.add_column("URL", style="blue")

    for i, repo in enumerate(agents, 1):
        table.add_row(
            str(i),
            repo["name"],
            repo["description"][:50],
            str(repo["stars"]),
            repo["url"],
        )

    console.print(table)

    choice = click.prompt("\nRun agent # (or Enter to skip)", default="", show_default=False)
    if not choice:
        return

    try:
        idx = int(choice) - 1
        if not (0 <= idx < len(agents)):
            raise ValueError
    except ValueError:
        console.print("[red]Invalid selection.[/red]")
        return

    repo_url = agents[idx]["url"]
    console.print(f"\n[bold]Running:[/bold] {repo_url}")
    from primordial.cli.run import run
    ctx = click.Context(run)
    ctx.invoke(run, agent_path=repo_url)
