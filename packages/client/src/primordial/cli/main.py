"""Primordial AgentStore CLI - main entry point."""

import click

from primordial.cli.cache import cache
from primordial.cli.install import install
from primordial.cli.search import search
from primordial.cli.keys import keys
from primordial.cli.run import run
from primordial.cli.restart import restart
from primordial.cli.serve import serve
from primordial.cli.sessions import sessions
from primordial.cli.setup import setup
from primordial.cli.mcp import mcp
from primordial.cli.apply import apply


@click.group()
@click.version_option(version="2.0.0", prog_name="primordial")
def cli():
    """Primordial AgentStore - The digital soup from which agents emerge."""
    pass


cli.add_command(setup)
cli.add_command(run)
cli.add_command(serve)
cli.add_command(sessions)
cli.add_command(install)
cli.add_command(keys)
cli.add_command(cache)
cli.add_command(search)
cli.add_command(restart)
cli.add_command(mcp)
cli.add_command(apply)


if __name__ == "__main__":
    cli()
