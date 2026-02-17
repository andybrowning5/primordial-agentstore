"""CLI commands for configuration."""

import click
from rich.console import Console

from agentstore.config import get_config

console = Console()


@click.group(name="config")
def config():
    """Manage Agent Store configuration."""
    pass


@config.command()
def show():
    """Show current configuration."""
    cfg = get_config()
    console.print(f"API URL:          {cfg.api_url}")
    console.print(f"Default provider: {cfg.default_model_provider}")
    console.print(f"Default model:    {cfg.default_model}")
    console.print(f"Sandbox timeout:  {cfg.sandbox_timeout}s")
    console.print(f"Sandbox memory:   {cfg.sandbox_max_memory}")
    console.print(f"\nConfig dir:       {cfg.config_dir}")
    console.print(f"Data dir:         {cfg.data_dir}")
    console.print(f"Cache dir:        {cfg.cache_dir}")
    console.print(f"Log dir:          {cfg.log_dir}")


@config.command(name="set")
@click.argument("key")
@click.argument("value")
def set_config(key: str, value: str):
    """Set a configuration value."""
    cfg = get_config()
    valid_keys = [
        "api_url",
        "default_model_provider",
        "default_model",
        "sandbox_timeout",
        "sandbox_max_memory",
    ]
    if key not in valid_keys:
        console.print(f"[red]Invalid key:[/red] {key}")
        console.print(f"Valid keys: {', '.join(valid_keys)}")
        raise SystemExit(1)

    if key == "sandbox_timeout":
        value = int(value)
    setattr(cfg, key, value)
    cfg.save()
    console.print(f"[green]Set {key} = {value}[/green]")
