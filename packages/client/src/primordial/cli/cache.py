"""CLI commands for managing the GitHub agent cache."""

from __future__ import annotations

from datetime import timedelta

import click
from rich.console import Console

from primordial.github import GitHubResolver, GitHubResolverError, parse_github_url

console = Console()


@click.group()
def cache():
    """Manage cached GitHub agents."""


@cache.command("list")
def cache_list():
    """List cached GitHub agent repos."""
    resolver = GitHubResolver()
    entries = resolver.list_cached()

    if not entries:
        console.print("[dim]No cached repos.[/dim]")
        return

    console.print(f"[bold]Cached repos ({len(entries)}):[/bold]\n")
    for entry in entries:
        owner = entry.get("owner", "?")
        repo = entry.get("repo", "?")
        ref = entry.get("ref") or "default"
        age = entry.get("age_seconds", 0)
        age_str = str(timedelta(seconds=age)).split(".")[0]
        console.print(f"  {owner}/{repo} @ {ref}  [dim](cached {age_str} ago)[/dim]")


@cache.command("clear")
@click.argument("repo", required=False)
@click.option("--all", "clear_all", is_flag=True, help="Clear entire cache")
def cache_clear(repo: str | None, clear_all: bool):
    """Clear cached GitHub repos.

    Optionally specify a repo URL to clear only that entry.
    """
    resolver = GitHubResolver()

    if clear_all:
        count = resolver.clear_cache()
        console.print(f"[green]Cleared {count} cached repo(s).[/green]")
    elif repo:
        try:
            ref = parse_github_url(repo)
            count = resolver.clear_cache(ref)
            if count:
                console.print(f"[green]Cleared cache for {ref}.[/green]")
            else:
                console.print(f"[dim]No cache entry found for {ref}.[/dim]")
        except GitHubResolverError as e:
            console.print(f"[red]{e}[/red]")
            raise SystemExit(1)
    else:
        console.print("[yellow]Specify a repo URL or use --all.[/yellow]")
