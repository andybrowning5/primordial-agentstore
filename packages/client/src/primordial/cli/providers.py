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


def build_provider_list(
    existing: set[str],
) -> list[tuple[int, str, str, str, str]]:
    """Build numbered list of providers with status.

    Returns list of (number, provider, env_var, url, status).
    """
    items: list[tuple[int, str, str, str, str]] = []
    seen = set()
    idx = 1

    for provider, env_var, url in KNOWN_PROVIDERS:
        status = "[green]stored[/green]" if provider in existing else "[dim]not set[/dim]"
        items.append((idx, provider, env_var, url, status))
        seen.add(provider)
        idx += 1

    for provider in sorted(existing - seen):
        env_var = f"{provider.upper()}_API_KEY"
        status = "[green]stored[/green]"
        items.append((idx, provider, env_var, "", status))
        idx += 1

    return items


def pick_provider(
    vault: KeyVault,
) -> tuple[str, str] | None:
    """Interactive provider picker loop. Returns (provider, key) or None if user exits."""
    existing = {e["provider"] for e in vault.list_keys()}
    items = build_provider_list(existing)

    console.print()
    for idx, provider, env_var, url, status in items:
        url_hint = f"  {url}" if url else ""
        console.print(f"  [cyan]{idx:>2}[/cyan]  {provider:<12} {status}[dim]{url_hint}[/dim]")
    console.print(f"  [cyan] +[/cyan]  [dim]Add a custom provider[/dim]")
    console.print()

    choice = click.prompt(
        "Pick a number (or name), Enter to finish",
        default="",
        show_default=False,
    ).strip()

    if not choice:
        return None

    target_provider = None
    if choice == "+":
        target_provider = click.prompt("  Provider name").strip().lower()
    elif choice.isdigit():
        num = int(choice)
        match = [i for i in items if i[0] == num]
        if match:
            target_provider = match[0][1]
        else:
            console.print("[red]Invalid number.[/red]")
            return None
    else:
        name_lower = choice.strip().lower()
        match = [i for i in items if i[1] == name_lower]
        if match:
            target_provider = match[0][1]
        else:
            target_provider = name_lower

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
