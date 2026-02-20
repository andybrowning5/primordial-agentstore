"""CLI commands for API key management."""

import click
from rich.console import Console
from rich.table import Table

from primordial.config import get_config
from primordial.security.key_vault import KeyVault
from primordial.cli.providers import pick_provider

console = Console()


@click.group()
def keys():
    """Manage API keys for LLM providers."""
    pass


@keys.command()
@click.argument("provider", required=False, default=None)
@click.argument("api_key", required=False, default=None)
@click.option("--key-id", default=None, help="Friendly identifier for this key")
def add(provider: str | None, api_key: str | None, key_id: str | None):
    """Add or update an API key for a provider.

    With no arguments, shows an interactive picker.
    With PROVIDER and API_KEY, stores directly.
    """
    config = get_config()
    vault = KeyVault(config.keys_file)

    # Direct mode: both args provided
    if provider and api_key:
        stored_id = vault.add_key(provider, api_key, key_id)
        console.print(f"[green]Key stored:[/green] {provider} (id: {stored_id})")
        return

    # Interactive picker mode
    while True:
        result = pick_provider(vault)
        if result is None:
            break
        target_provider, key = result
        vault.add_key(target_provider, key)
        console.print(f"  [green]Stored {target_provider}.[/green]")


@keys.command(name="list")
def list_keys():
    """List all stored API keys."""
    config = get_config()
    vault = KeyVault(config.keys_file)
    entries = vault.list_keys()

    if not entries:
        console.print("[dim]No API keys stored. Use 'primordial keys add' to add one.[/dim]")
        return

    table = Table(title="Stored API Keys")
    table.add_column("Provider", style="cyan")
    table.add_column("Key ID", style="green")
    table.add_column("Created", style="dim")
    table.add_column("Last Used", style="dim")

    for entry in entries:
        table.add_row(
            entry["provider"],
            entry["key_id"],
            entry["created_at"][:10] if entry["created_at"] else "-",
            entry["last_used"][:10] if entry["last_used"] else "Never",
        )
    console.print(table)


@keys.command()
@click.argument("provider")
@click.option("--key-id", default=None, help="Specific key ID to remove")
@click.confirmation_option(prompt="Are you sure you want to remove this key?")
def remove(provider: str, key_id: str | None):
    """Remove a stored API key."""
    config = get_config()
    vault = KeyVault(config.keys_file)
    if vault.remove_key(provider, key_id):
        console.print(f"[green]Key removed:[/green] {provider}")
    else:
        console.print(
            f"[red]Key not found:[/red] {provider}" + (f" (id: {key_id})" if key_id else "")
        )
