"""Agent Store CLI - main entry point."""

import click

from agentstore.cli.keys import keys
from agentstore.cli.run import run
from agentstore.cli.browse import browse, search, info
from agentstore.cli.auth import auth
from agentstore.cli.publish import publish, init
from agentstore.cli.config_cmd import config


@click.group()
@click.version_option(version="0.1.0", prog_name="agentstore")
def cli():
    """Agent Store - Marketplace for specialized TUI AI agents."""
    pass


cli.add_command(keys)
cli.add_command(run)
cli.add_command(browse)
cli.add_command(search)
cli.add_command(info)
cli.add_command(auth)
cli.add_command(publish)
cli.add_command(init)
cli.add_command(config)


if __name__ == "__main__":
    cli()
