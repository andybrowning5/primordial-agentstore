"""Interactive first-run setup for Primordial AgentStore."""

import click
from rich.console import Console
from rich.text import Text
from rich.panel import Panel
from rich.table import Table

from agentstore.config import get_config
from agentstore.security.key_vault import KeyVault

console = Console()

# Provider name, env var hint, signup URL
PROVIDERS = [
    ("anthropic", "ANTHROPIC_API_KEY", "https://console.anthropic.com/settings/keys"),
    ("openai", "OPENAI_API_KEY", "https://platform.openai.com/api-keys"),
    ("brave", "BRAVE_API_KEY", "https://brave.com/search/api/"),
    ("groq", "GROQ_API_KEY", "https://console.groq.com/keys"),
    ("google", "GOOGLE_API_KEY", "https://aistudio.google.com/apikey"),
    ("mistral", "MISTRAL_API_KEY", "https://console.mistral.ai/api-keys/"),
    ("deepseek", "DEEPSEEK_API_KEY", "https://platform.deepseek.com/api_keys"),
]

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


def _build_provider_list(existing: set[str]) -> list[tuple[int, str, str, str, str]]:
    """Build numbered list of all providers (known + any extras in vault).

    Returns list of (number, provider, env_var, url, status).
    """
    items: list[tuple[int, str, str, str, str]] = []
    seen = set()
    idx = 1

    # Known providers + e2b
    all_known = list(PROVIDERS) + [("e2b", "E2B_API_KEY", "https://e2b.dev/dashboard")]
    for provider, env_var, url in all_known:
        status = "[green]stored[/green]" if provider in existing else "[dim]not set[/dim]"
        items.append((idx, provider, env_var, url, status))
        seen.add(provider)
        idx += 1

    # Any extra providers in the vault that aren't in PROVIDERS
    for provider in sorted(existing - seen):
        env_var = f"{provider.upper()}_API_KEY"
        status = "[green]stored[/green]"
        items.append((idx, provider, env_var, "", status))
        idx += 1

    return items


def _print_provider_list(items: list[tuple[int, str, str, str, str]]) -> None:
    """Print the numbered provider list."""
    for idx, provider, env_var, url, status in items:
        url_hint = f"  {url}" if url else ""
        console.print(f"  [cyan]{idx:>2}[/cyan]  {provider:<12} {status}[dim]{url_hint}[/dim]")


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
        existing = {e["provider"] for e in vault.list_keys()}
        items = _build_provider_list(existing)
        _print_provider_list(items)
        console.print(f"  [cyan] +[/cyan]  [dim]Add a custom provider[/dim]")
        console.print()

        choice = click.prompt(
            "Pick a number (or name), Enter to finish",
            default="",
            show_default=False,
        ).strip()

        if not choice:
            break

        # Resolve choice to a provider
        provider_name = None
        env_var = None
        if choice == "+":
            provider_name = click.prompt("  Provider name").strip().lower()
            env_var = f"{provider_name.upper()}_API_KEY"
        elif choice.isdigit():
            num = int(choice)
            match = [i for i in items if i[0] == num]
            if match:
                _, provider_name, env_var, _, _ = match[0]
            else:
                console.print("[red]Invalid number.[/red]")
                continue
        else:
            # Try matching by name
            name_lower = choice.lower()
            match = [i for i in items if i[1] == name_lower]
            if match:
                _, provider_name, env_var, _, _ = match[0]
            else:
                # Treat as new custom provider
                provider_name = name_lower
                env_var = f"{provider_name.upper()}_API_KEY"

        key = click.prompt(
            f"  Paste {provider_name.upper()} API key (Enter to cancel)",
            default="",
            show_default=False,
            hide_input=True,
        )

        if key.strip():
            vault.add_key(provider_name, key.strip())
            console.print(f"  [green]Stored {provider_name}.[/green]")
            added += 1
        else:
            console.print(f"  [dim]Skipped.[/dim]")

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

    # Timezone configuration
    current_tz = config.get_timezone()
    if current_tz:
        console.print(f"  Timezone: [green]{current_tz}[/green]")
        if click.confirm("  Change timezone?", default=False):
            _prompt_timezone(config)
    else:
        _prompt_timezone(config)

    console.print()
    console.print(f"[bold bright_green]Done.[/bold bright_green] {added} key(s) added this session.")
    console.print()


def _prompt_timezone(config) -> None:
    """Ask the user for their timezone."""
    import subprocess
    # Try to detect system timezone
    detected = None
    try:
        result = subprocess.run(
            ["python3", "-c", "import time; print(time.tzname[0])"],
            capture_output=True, text=True, timeout=3,
        )
        # Get IANA timezone instead
        import platform
        if platform.system() == "Darwin":
            result = subprocess.run(
                ["readlink", "/etc/localtime"],
                capture_output=True, text=True, timeout=3,
            )
            if result.returncode == 0:
                # /var/db/timezone/zoneinfo/America/Chicago -> America/Chicago
                parts = result.stdout.strip().split("/zoneinfo/")
                if len(parts) == 2:
                    detected = parts[1]
        elif platform.system() == "Linux":
            from pathlib import Path
            tz_file = Path("/etc/timezone")
            if tz_file.exists():
                detected = tz_file.read_text().strip()
    except Exception:
        pass

    prompt_text = "  Your timezone (e.g. America/New_York)"
    if detected:
        tz = click.prompt(prompt_text, default=detected).strip()
    else:
        tz = click.prompt(prompt_text).strip()

    if tz:
        config.set_timezone(tz)
        console.print(f"  [green]Timezone set to {tz}[/green]")
