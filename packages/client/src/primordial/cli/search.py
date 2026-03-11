"""CLI command for searching primordial-agent repos on GitHub."""

import json as json_mod

import click
from rich.console import Console
from rich.table import Table

from primordial.discovery import fetch_agents, enrich_from_cache, MAX_RESULTS
from primordial.ranking import semantic_rank

console = Console()


@click.command()
@click.argument("query", required=False, default=None)
@click.option("--agent", "as_agent", is_flag=True, help="Output results as JSON for host agents.")
def search(query: str | None, as_agent: bool = False):
    """Search for Primordial agents on GitHub."""
    if as_agent:
        try:
            agents = fetch_agents()
            agents = enrich_from_cache(agents)
            if query:
                agents = semantic_rank(query, agents)
            else:
                agents = agents[:MAX_RESULTS]
        except Exception as e:
            click.echo(json_mod.dumps({"error": str(e)}))
            raise SystemExit(1)
        click.echo(json_mod.dumps(agents))
        return

    with console.status("[bold green]Searching GitHub..."):
        try:
            agents = fetch_agents()
            agents = enrich_from_cache(agents)
            if query:
                agents = semantic_rank(query, agents)
            else:
                agents = agents[:MAX_RESULTS]
        except Exception as e:
            console.print(f"[red]GitHub API error: {e}[/red]")
            return

    if not agents:
        console.print("[yellow]No agents found.[/yellow]")
        return

    table = Table(title="Primordial Agents", show_lines=True)
    table.add_column("#", style="dim", width=3)
    table.add_column("Agent", style="cyan", no_wrap=True)
    table.add_column("Description")
    table.add_column("Stars", justify="right", style="yellow", width=5)

    for i, repo in enumerate(agents, 1):
        # Show just the repo name, not owner/repo
        short_name = repo["name"].split("/")[-1] if "/" in repo["name"] else repo["name"]
        table.add_row(
            str(i),
            short_name,
            repo["description"],
            str(repo["stars"]),
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
