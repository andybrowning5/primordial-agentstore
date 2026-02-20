"""CLI command for searching primordial-agent repos on GitHub."""

import click
import httpx
from rich.console import Console
from rich.table import Table

console = Console()

GITHUB_SEARCH_URL = "https://api.github.com/search/repositories"


def _fetch_results(query: str | None) -> list[dict]:
    topic_query = "topic:primordial-agent"
    q = f"{topic_query} {query}" if query else topic_query
    resp = httpx.get(
        GITHUB_SEARCH_URL,
        params={"q": q, "sort": "stars", "order": "desc", "per_page": 20},
        headers={"Accept": "application/vnd.github.v3+json"},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json().get("items", [])


@click.command()
@click.argument("query", required=False, default=None)
def search(query: str | None):
    """Search for Primordial agents on GitHub."""
    with console.status("[bold green]Searching GitHub..."):
        try:
            repos = _fetch_results(query)
        except httpx.HTTPError as e:
            console.print(f"[red]GitHub API error: {e}[/red]")
            return

    if not repos:
        console.print("[yellow]No agents found.[/yellow]")
        return

    table = Table(title="Primordial Agents")
    table.add_column("#", style="dim", width=3)
    table.add_column("Name", style="cyan")
    table.add_column("Description", max_width=50)
    table.add_column("Stars", justify="right", style="yellow")
    table.add_column("URL", style="blue")

    for i, repo in enumerate(repos, 1):
        table.add_row(
            str(i),
            repo["full_name"],
            (repo.get("description") or "")[:50],
            str(repo.get("stargazers_count", 0)),
            repo["html_url"],
        )

    console.print(table)

    choice = click.prompt("\nRun agent # (or Enter to skip)", default="", show_default=False)
    if not choice:
        return

    try:
        idx = int(choice) - 1
        if not (0 <= idx < len(repos)):
            raise ValueError
    except ValueError:
        console.print("[red]Invalid selection.[/red]")
        return

    repo_url = repos[idx]["html_url"]
    console.print(f"\n[bold]Running:[/bold] {repo_url}")
    from primordial.cli.run import run
    ctx = click.Context(run)
    ctx.invoke(run, agent_path=repo_url)
