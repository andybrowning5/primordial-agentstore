"""Shared provider list building and interactive picker."""

from __future__ import annotations

import click
from rich.console import Console

from primordial.security.key_vault import KeyVault

console = Console()

KNOWN_PROVIDERS = [
    ("anthropic", "ANTHROPIC_API_KEY", "https://console.anthropic.com/settings/keys"),
    ("openai", "OPENAI_API_KEY", "https://platform.openai.com/api-keys"),
    ("brave", "BRAVE_API_KEY", "https://brave.com/search/api/"),
    ("groq", "GROQ_API_KEY", "https://console.groq.com/keys"),
    ("google", "GOOGLE_API_KEY", "https://aistudio.google.com/apikey"),
    ("mistral", "MISTRAL_API_KEY", "https://console.mistral.ai/api-keys/"),
    ("deepseek", "DEEPSEEK_API_KEY", "https://platform.deepseek.com/api_keys"),
    ("e2b", "E2B_API_KEY", "https://e2b.dev/dashboard"),
]

# Quick lookup for known provider URLs
_PROVIDER_URLS = {p: url for p, _, url in KNOWN_PROVIDERS}


def pick_provider(
    vault: KeyVault,
) -> tuple[str, str] | None:
    """Interactive provider picker. Shows stored keys + add option.

    Returns (provider, key) or None if user exits.
    """
    existing = vault.list_keys()

    console.print()

    if existing:
        for i, entry in enumerate(existing, 1):
            console.print(f"  [cyan]{i:>2}[/cyan]  {entry['provider']:<12} [green]stored[/green]")
    else:
        console.print("  [dim]No API keys stored yet.[/dim]")

    console.print(f"  [cyan] +[/cyan]  [dim]Add a new key[/dim]")
    console.print()

    choice = click.prompt(
        "Pick a number to update, + to add, Enter to finish",
        default="",
        show_default=False,
    ).strip()

    if not choice:
        return None

    target_provider = None

    if choice == "+":
        target_provider = click.prompt("  Provider name").strip().lower()
        url = _PROVIDER_URLS.get(target_provider)
        if url:
            console.print(f"  [dim]Get a key at: {url}[/dim]")
    elif choice.isdigit():
        num = int(choice)
        if 1 <= num <= len(existing):
            target_provider = existing[num - 1]["provider"]
        else:
            console.print("[red]Invalid number.[/red]")
            return None
    else:
        target_provider = choice.strip().lower()

    key = click.prompt(
        f"  Paste {target_provider.upper()} API key (Enter to cancel)",
        default="",
        show_default=False,
        hide_input=True,
    )

    if key.strip():
        return (target_provider, key.strip())
    console.print(f"  [dim]Skipped.[/dim]")
    return None
