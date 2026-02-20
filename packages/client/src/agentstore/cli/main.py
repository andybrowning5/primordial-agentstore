"""Agent Store CLI - main entry point."""

import click

from agentstore.cli.cache import cache
from agentstore.cli.keys import keys
from agentstore.cli.run import run
from agentstore.cli.sessions import sessions
from agentstore.cli.setup import setup


@click.group()
@click.version_option(version="0.1.0", prog_name="primordial")
def cli():
    """Primordial AgentStore - The digital soup from which agents emerge."""
    pass


cli.add_command(setup)
cli.add_command(run)
cli.add_command(sessions)
cli.add_command(keys)
cli.add_command(cache)


if __name__ == "__main__":
    cli()
