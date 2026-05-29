"""CLI command: publish an agent to GitHub as a Primordial agent.

Pipeline:
  1. validate the manifest
  2. create the GitHub repo (via `gh`) if it does not already exist
  3. push the current commit
  4. add the `primordial-agent` topic
  5. tag the manifest's semver version
  6. (optional) ping the index crawler refresh endpoint

Idempotent: re-running on an existing repo just pushes + re-tags. Use
--dry-run to print the plan without making changes.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import click
import httpx
from rich.console import Console

from primordial.config import get_config
from primordial.manifest import load_manifest

console = Console()

PRIMORDIAL_TOPIC = "primordial-agent"


def _run(cmd: list[str], cwd: Path | None = None, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        cmd, cwd=str(cwd) if cwd else None,
        capture_output=True, text=True, timeout=120, check=check,
    )


def _gh_available() -> bool:
    try:
        _run(["gh", "--version"])
        return True
    except (FileNotFoundError, subprocess.CalledProcessError):
        return False


def _repo_exists(slug: str) -> bool:
    r = _run(["gh", "repo", "view", slug, "--json", "name"], check=False)
    return r.returncode == 0


def _current_repo_slug(agent_dir: Path) -> str | None:
    """Return owner/repo from the git 'origin' remote, if any."""
    r = _run(["gh", "repo", "view", "--json", "nameWithOwner"], cwd=agent_dir, check=False)
    if r.returncode == 0:
        try:
            return json.loads(r.stdout)["nameWithOwner"]
        except (ValueError, KeyError):
            pass
    return None


@click.command()
@click.argument("agent_path", default=".")
@click.option("--repo", "repo_slug", default=None,
              help="Target repo as owner/repo (defaults to the existing git remote, "
                   "else <gh-user>/<manifest-name>).")
@click.option("--private", is_flag=True, help="Create the repo as private.")
@click.option("--dry-run", is_flag=True, help="Print the plan; make no changes.")
@click.option("--no-refresh", is_flag=True, help="Skip pinging the index crawler refresh endpoint.")
def publish(agent_path: str, repo_slug: str | None, private: bool, dry_run: bool, no_refresh: bool):
    """Publish the agent at AGENT_PATH to GitHub (default: current directory)."""
    agent_dir = Path(agent_path).resolve()

    # 1. Validate manifest
    try:
        manifest = load_manifest(agent_dir)
    except (FileNotFoundError, ValueError) as e:
        console.print(f"[red]Manifest invalid:[/red] {e}")
        raise SystemExit(1)
    console.print(f"[green]Manifest OK[/green] — {manifest.display_name} v{manifest.version}")

    if not _gh_available():
        console.print(
            "[red]GitHub CLI (`gh`) not found.[/red] Install it and run "
            "`gh auth login`, then retry."
        )
        raise SystemExit(1)

    if not (agent_dir / ".git").exists():
        console.print(f"[red]Not a git repository:[/red] {agent_dir}")
        console.print("[dim]Initialize and commit first: git init && git add -A && git commit[/dim]")
        raise SystemExit(1)

    # Resolve target slug
    slug = repo_slug or _current_repo_slug(agent_dir)
    if not slug:
        user = _run(["gh", "api", "user", "--jq", ".login"], check=False)
        if user.returncode != 0 or not user.stdout.strip():
            console.print("[red]Could not determine GitHub user. Run `gh auth login`.[/red]")
            raise SystemExit(1)
        slug = f"{user.stdout.strip()}/{manifest.name}"

    tag = f"v{manifest.version}"
    exists = _repo_exists(slug)

    console.print(f"\n[bold]Plan[/bold] for [cyan]{slug}[/cyan]:")
    console.print(f"  - {'push to existing repo' if exists else 'create repo'} "
                  f"({'private' if private else 'public'})")
    console.print(f"  - ensure topic: {PRIMORDIAL_TOPIC}")
    console.print(f"  - tag: {tag}")
    if not no_refresh:
        console.print(f"  - ping crawler refresh: {get_config().index_url}/refresh")

    if dry_run:
        console.print("\n[dim]--dry-run: no changes made.[/dim]")
        return

    # 2. Create repo (idempotent) + push
    if not exists:
        console.print(f"\n[dim]Creating {slug}...[/dim]")
        visibility = "--private" if private else "--public"
        create = _run(
            ["gh", "repo", "create", slug, visibility, "--source", ".", "--push"],
            cwd=agent_dir, check=False,
        )
        if create.returncode != 0:
            console.print(f"[red]Repo create failed:[/red] {create.stderr.strip()[:300]}")
            raise SystemExit(1)
    else:
        console.print(f"\n[dim]Repo {slug} exists — pushing current branch...[/dim]")
        push = _run(["git", "push"], cwd=agent_dir, check=False)
        if push.returncode != 0:
            console.print(f"[yellow]git push warning:[/yellow] {push.stderr.strip()[:300]}")

    # 4. Topic
    topic = _run(
        ["gh", "repo", "edit", slug, "--add-topic", PRIMORDIAL_TOPIC],
        check=False,
    )
    if topic.returncode == 0:
        console.print(f"[green]Topic ensured:[/green] {PRIMORDIAL_TOPIC}")
    else:
        console.print(f"[yellow]Could not set topic:[/yellow] {topic.stderr.strip()[:200]}")

    # 5. Tag (idempotent — skip if it already exists locally or remotely)
    _ensure_tag(agent_dir, tag, slug)

    # 6. Refresh ping (best-effort)
    if not no_refresh:
        _ping_refresh(slug)

    console.print(f"\n[bold green]Published[/bold green] {slug} ({tag})")
    console.print(f"[dim]https://github.com/{slug}[/dim]")


def _ensure_tag(agent_dir: Path, tag: str, slug: str) -> None:
    existing = _run(["git", "tag", "--list", tag], cwd=agent_dir, check=False)
    if existing.stdout.strip() == tag:
        console.print(f"[dim]Tag {tag} already exists locally — pushing.[/dim]")
    else:
        created = _run(["git", "tag", tag], cwd=agent_dir, check=False)
        if created.returncode != 0:
            console.print(f"[yellow]Could not create tag {tag}:[/yellow] {created.stderr.strip()[:200]}")
            return
    push = _run(["git", "push", "origin", tag], cwd=agent_dir, check=False)
    if push.returncode == 0:
        console.print(f"[green]Tagged:[/green] {tag}")
    else:
        console.print(f"[yellow]Tag push warning:[/yellow] {push.stderr.strip()[:200]}")


def _ping_refresh(slug: str) -> None:
    index_url = get_config().index_url
    if not index_url.startswith("https://"):
        console.print("[dim]Skipping crawler refresh (index URL is not HTTPS).[/dim]")
        return
    try:
        resp = httpx.post(f"{index_url}/refresh", json={"agent_id": slug}, timeout=10)
        if resp.status_code < 400:
            console.print("[dim]Crawler refresh pinged.[/dim]")
        else:
            console.print(f"[dim]Crawler refresh returned {resp.status_code} (ignored).[/dim]")
    except httpx.HTTPError as e:
        console.print(f"[dim]Crawler refresh ping failed (ignored): {e}[/dim]")
