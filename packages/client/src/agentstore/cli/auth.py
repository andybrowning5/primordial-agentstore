"""CLI commands for authentication."""

import click
from rich.console import Console

from agentstore.config import get_config

console = Console()


@click.group()
def auth():
    """Manage authentication with Agent Store."""
    pass


@auth.command()
@click.option("--provider", type=click.Choice(["github", "google"]), default="github")
def login(provider: str):
    """Log in to Agent Store via OAuth."""
    # TODO: Implement OAuth flow
    console.print(f"[dim]OAuth login via {provider} coming soon.[/dim]")


@auth.command()
def logout():
    """Log out of Agent Store."""
    config = get_config()
    if config.auth_token_file.exists():
        config.auth_token_file.unlink()
        console.print("[green]Logged out successfully.[/green]")
    else:
        console.print("[dim]Not currently logged in.[/dim]")


@auth.command()
def whoami():
    """Show current authenticated user."""
    config = get_config()
    if config.auth_token_file.exists():
        console.print("[dim]Token exists but user info display not yet implemented.[/dim]")
    else:
        console.print("[dim]Not logged in. Use 'agentstore auth login' to authenticate.[/dim]")
