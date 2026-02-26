"""Primordial AgentStore CLI - main entry point."""

import click

from primordial.cli.cache import cache
from primordial.cli.search import search
from primordial.cli.keys import keys
from primordial.cli.run import run
from primordial.cli.sessions import sessions
from primordial.cli.setup import setup
from primordial.cli.serve import serve


@click.group()
@click.version_option(version="0.6.0", prog_name="primordial")
def cli():
    """Primordial AgentStore - The digital soup from which agents emerge."""
    pass


cli.add_command(setup)
cli.add_command(run)
cli.add_command(sessions)
cli.add_command(keys)
cli.add_command(cache)
cli.add_command(search)
cli.add_command(serve)


if __name__ == "__main__":
    cli()
