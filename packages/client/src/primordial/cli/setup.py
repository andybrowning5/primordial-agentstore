"""Interactive first-run setup for Primordial AgentStore."""

import time
from pathlib import Path

import click
from rich.console import Console, Group
from rich.live import Live
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from primordial.config import get_config
from primordial.security.key_vault import KeyVault
from primordial.cli.providers import pick_provider
from primordial.cli.helix import _helix_frame, _build_banner

console = Console()


def _print_banner() -> None:
    """Show the animated helix banner, morphing into a cell at the end."""
    morph_start = 15   # 1s helix, then morph
    morph_end = 30
    hold_end = 45      # 1s hold
    with Live(console=console, refresh_per_second=15) as live:
        for frame in range(hold_end):
            if frame < morph_start:
                morph = 0.0
            elif frame < morph_end:
                morph = (frame - morph_start) / (morph_end - morph_start)
            else:
                morph = 1.0
            helix = _helix_frame(frame * 0.18, morph=morph)
            banner = _build_banner(helix)
            live.update(Group(Text(""), banner))
            time.sleep(1 / 15)
    console.print()


def _setup_for_agent(agent_url: str):
    """Resolve an agent manifest and prompt for missing keys."""
    from primordial.github import GitHubResolver, GitHubResolverError, is_github_url, parse_github_url
    from primordial.manifest import load_manifest

    config = get_config()
    vault = KeyVault(config.keys_file)

    # Resolve agent directory
    if is_github_url(agent_url):
        try:
            github_ref = parse_github_url(agent_url)
            resolver = GitHubResolver()
            agent_dir = resolver.resolve(github_ref)
        except GitHubResolverError as e:
            console.print(f"[red]Failed to resolve agent: {e}[/red]")
            raise SystemExit(1)
    else:
        agent_dir = Path(agent_url)
        if not agent_dir.exists():
            installed = config.agents_dir / agent_url
            if installed.exists():
                agent_dir = installed
            else:
                console.print(f"[red]Agent not found: {agent_url}[/red]")
                raise SystemExit(1)

    try:
        manifest = load_manifest(agent_dir)
    except (FileNotFoundError, ValueError) as e:
        console.print(f"[red]Invalid agent: {e}[/red]")
        raise SystemExit(1)

    console.print(f"\n[bold]Setting up keys for:[/bold] {manifest.name}")

    if not manifest.keys:
        console.print("[dim]This agent has no key requirements.[/dim]")
        return

    # Always need e2b
    all_providers = {kr.provider for kr in manifest.keys}
    all_providers.add("e2b")

    missing = []
    present = []
    for provider in sorted(all_providers):
        if vault.get_key(provider):
            present.append(provider)
        else:
            # Check if required (e2b is always required)
            req = next((kr for kr in manifest.keys if kr.provider == provider), None)
            is_required = provider == "e2b" or (req and req.required)
            missing.append((provider, is_required))

    if not missing:
        console.print()
        for p in sorted(present):
            console.print(f"  {p:<16} [green]✓[/green]")
        console.print(f"\n[bold green]{manifest.name} is ready![/bold green]")
        return

    # Prompt for missing keys
    added = 0
    for provider, required in missing:
        label = f"{'(required)' if required else '(optional)'}"
        key = click.prompt(
            f"  Paste {provider.upper()} API key {label} (Enter to skip)",
            default="",
            show_default=False,
            hide_input=True,
        ).strip()
        if key:
            vault.add_key(provider, key)
            console.print(f"  [green]Stored {provider}.[/green]")
            present.append(provider)
            added += 1
        elif required:
            console.print(f"  [yellow]Skipped {provider} (required — agent may not work).[/yellow]")

    # Summary
    console.print()
    for p in sorted(present):
        console.print(f"  {p:<16} [green]✓[/green]")
    still_missing = [p for p, req in missing if p not in present]
    for p in still_missing:
        console.print(f"  {p:<16} [red]✗[/red]")

    console.print(f"\n[bold]{added} key(s) added.[/bold]")


def _setup_interactive():
    """Original interactive key picker flow."""
    _print_banner()

    config = get_config()
    vault = KeyVault(config.keys_file)

    console.print(
        Panel(
            "[bold]Primordial Key Vault[/bold]\n\n"
            "Manage your stored API keys. Pick one to update, or + to add.\n\n"
            "[dim]Keys are encrypted at rest on this machine.\n"
            "Missing keys are prompted automatically when you run an agent.[/dim]",
            border_style="bright_cyan",
            padding=(1, 2),
        )
    )
    console.print()

    added = 0

    while True:
        result = pick_provider(vault)
        if result is None:
            break
        provider_name, key = result
        vault.add_key(provider_name, key)
        console.print(f"  [green]Stored {provider_name}.[/green]")
        added += 1
        console.print()

    # Summary
    console.print()
    all_keys = vault.list_keys()

    if all_keys:
        table = Table(title="Your Key Vault", border_style="bright_cyan")
        table.add_column("Provider", style="cyan bold")
        table.add_column("Status", style="green")
        for entry in all_keys:
            table.add_row(entry["provider"], "ready")
        console.print(table)

    console.print()
    console.print(f"[bold bright_green]Done.[/bold bright_green] {added} key(s) added this session.")
    console.print()


@click.command()
@click.argument("agent_url", required=False, default=None)
def setup(agent_url: str | None):
    """Configure API keys — pick a provider, add or update its key.

    Optionally pass an agent URL to set up only the keys that agent needs:

        primordial setup https://github.com/user/web-research-agent
    """
    if agent_url:
        _setup_for_agent(agent_url)
    else:
        _setup_interactive()
