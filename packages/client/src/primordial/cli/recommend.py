"""CLI command: recommend agents for a task via the cached catalog."""

import json as json_mod

import click
from rich.console import Console
from rich.table import Table

console = Console()


@click.command()
@click.argument("task")
@click.option("--top", "top_k", default=5, show_default=True, help="Number of candidates to return.")
@click.option("--refresh", is_flag=True, help="Force a fresh catalog fetch (ignore cache).")
@click.option("--agent", "as_agent", is_flag=True, help="Output JSON for host agents.")
def recommend(task: str, top_k: int, refresh: bool, as_agent: bool):
    """Recommend Primordial agents for a TASK using the cached catalog.

    Ranks the cached index catalog with a blended score (semantic relevance +
    popularity + stars). Falls back to live GitHub discovery if the index is
    unreachable.
    """
    from primordial.catalog import load_catalog
    from primordial.ranking import blended_rank

    try:
        agents, source = load_catalog(force_refresh=refresh)
    except Exception as e:  # pragma: no cover — load_catalog is defensive
        if as_agent:
            click.echo(json_mod.dumps({"error": str(e)}))
            raise SystemExit(1)
        console.print(f"[red]Failed to load catalog:[/red] {e}")
        raise SystemExit(1)

    ranked = blended_rank(task, agents, top_k=top_k)

    if as_agent:
        click.echo(json_mod.dumps({"source": source, "candidates": ranked}))
        return

    if not ranked:
        console.print("[yellow]No agents found for that task.[/yellow]")
        return

    table = Table(title=f"Recommended agents  [dim](source: {source})[/dim]", show_lines=True)
    table.add_column("#", style="dim", width=3)
    table.add_column("Agent", style="cyan", no_wrap=True)
    table.add_column("Confidence", width=10)
    table.add_column("Why")

    _conf_color = {"high": "green", "medium": "yellow", "low": "red"}
    for i, a in enumerate(ranked, 1):
        conf = a.get("confidence", "low")
        table.add_row(
            str(i),
            a.get("id") or a.get("name", ""),
            f"[{_conf_color.get(conf, 'white')}]{conf}[/]",
            a.get("why", ""),
        )

    console.print(table)
    top = ranked[0]
    console.print(
        f"\n[dim]Run the top pick:[/dim] primordial run {top.get('url') or top.get('id')}"
    )
