"""Interactive first-run setup for Primordial AgentStore."""

import click
from rich.console import Console
from rich.text import Text
from rich.panel import Panel
from rich.table import Table

from primordial.config import get_config
from primordial.security.key_vault import KeyVault
from primordial.cli.providers import pick_provider

console = Console()

_BANNER = r"""          ___           ___                       ___           ___
         /\  \         /\  \          ___          /\__\         /\  \
        /::\  \       /::\  \        /\  \        /::|  |       /::\  \
       /:/\:\  \     /:/\:\  \       \:\  \      /:|:|  |      /:/\:\  \
      /::\~\:\  \   /::\~\:\  \     /::\__\    /:/|:|__|__   /:/  \:\  \
     /:/\:\ \:\__\ /:/\:\ \:\__\ __/:/\/__/   /:/ |::::\__\ /:/__/ \:\__\
     \/__\:\/:/  / \/_|::\/:/  //\/:/  /      \/__/~~/:/  / \:\  \ /:/  /
          \::/  /     |:|::/  / \::/__/             /:/  /   \:\  /:/  /
           \/__/      |:|\/__/   \:\__\            /:/  /     \:\/:/  /
                      |:|  |     \/__/            /:/  /       \::/  /
                       \|__|                      \/__/         \/__/"""

_DIVIDER = "    ─────────────────────────── AGENTSTORE ───────────────────────────"
_SLOGAN = '          "Where lightning meets the digital soup."'
_TAGLINE = "    Spawn agents from the broth. Let them compete, persist, evolve."


def _print_banner() -> None:
    console.print()
    art = Text(_BANNER)
    art.stylize("bold bright_green")
    console.print(art)
    div = Text(_DIVIDER)
    div.stylize("bold bright_cyan")
    console.print(div)
    slogan = Text(_SLOGAN)
    slogan.stylize("dim italic")
    console.print(slogan)
    tagline = Text(_TAGLINE)
    tagline.stylize("dim")
    console.print(tagline)
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
            "[bold]Welcome to Primordial AgentStore[/bold]\n\n"
            "Agents need API keys to call LLMs, search the web, and use external services.\n"
            "Pick a provider below to add or update its key.\n\n"
            "[dim]Keys are encrypted at rest on this machine. They are injected into\n"
            "agent sandboxes as environment variables at runtime.[/dim]",
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
