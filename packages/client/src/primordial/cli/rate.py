"""CLI command: rate a Primordial agent (1-5) via the index ratings API."""

import click
import httpx
from rich.console import Console

console = Console()


def _normalize_agent_id(agent: str) -> str:
    """Resolve an agent reference to its catalog id (owner/repo)."""
    from primordial.github import is_github_url, parse_github_url

    if is_github_url(agent):
        try:
            ref = parse_github_url(agent)
            return f"{ref.owner}/{ref.repo}"
        except Exception:
            return agent
    return agent.strip("/")


@click.command()
@click.argument("agent")
@click.argument("stars", type=click.IntRange(1, 5))
@click.option("--comment", default=None, help="Optional comment (<=500 chars).")
def rate(agent: str, stars: int, comment: str | None):
    """Rate an AGENT from 1 to 5 stars.

    AGENT may be an owner/repo id or a GitHub URL. Requires a GitHub token
    (via `gh auth login` or the GH_TOKEN env var) — the index verifies it to
    record one rating per user per agent.
    """
    from primordial.index_client import submit_rating

    agent_id = _normalize_agent_id(agent)
    try:
        result = submit_rating(agent_id, stars, comment)
    except ValueError as e:
        console.print(f"[red]{e}[/red]")
        raise SystemExit(1)
    except httpx.HTTPStatusError as e:
        console.print(
            f"[red]Rating rejected ({e.response.status_code}):[/red] "
            f"{e.response.text[:200]}"
        )
        raise SystemExit(1)
    except httpx.HTTPError as e:
        console.print(f"[red]Network error submitting rating:[/red] {e}")
        raise SystemExit(1)

    console.print(f"[green]Rated {agent_id} {stars}/5.[/green]")
    if isinstance(result, dict) and result.get("rating_avg") is not None:
        console.print(
            f"[dim]New average: {result['rating_avg']} "
            f"({result.get('rating_count', '?')} ratings)[/dim]"
        )
