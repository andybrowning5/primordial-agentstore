"""Interactive first-run setup for Primordial AgentStore."""

import time

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


@click.command()
def setup():
    """Configure API keys — pick a provider, add or update its key.

    Shows a numbered list of providers. Pick one to add/replace,
    press Enter to exit. Keys are encrypted and stored locally.
    """
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
