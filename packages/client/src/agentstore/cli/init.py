"""CLI command for scaffolding new agent projects."""

from pathlib import Path
from textwrap import dedent

import click
from rich.console import Console

console = Console()


@click.command()
@click.argument("name")
@click.option("--description", "-d", default=None, help="Short agent description")
def init(name: str, description: str | None):
    """Initialize a new agent project.

    Creates a ready-to-run agent scaffold with manifest, entry point,
    system prompt, and dependencies.

    \b
    Examples:
      agentstore init my-agent
      agentstore init code-reviewer -d "Reviews PRs for common issues"
    """
    agent_dir = Path(name)
    if agent_dir.exists():
        console.print(f"[red]Directory '{name}' already exists.[/red]")
        raise SystemExit(1)

    if description is None:
        description = click.prompt(
            "Short description",
            default=f"A specialized agent for {name.replace('-', ' ')}",
        )

    agent_name = agent_dir.name
    display_name = agent_name.replace("-", " ").title()

    # Create directory structure
    agent_dir.mkdir(parents=True)
    (agent_dir / "src").mkdir()

    # Write agent.yaml
    manifest = dedent(f"""\
        name: "{agent_name}"
        display_name: "{display_name}"
        version: "0.1.0"
        description: "{description}"

        author:
          name: "Your Name"
          github: "your-github"

        runtime:
          language: "python"
          entry_point: "src/agent:create_agent"
          dependencies: "requirements.txt"
          default_model:
            provider: "anthropic"
            model: "claude-sonnet-4-5-20250929"
          resources:
            max_duration: 300
            max_session_duration: 3600

        permissions:
          network:
            - domain: "api.anthropic.com"
              reason: "LLM API access"
          filesystem:
            workspace: "readwrite"
    """)
    (agent_dir / "agent.yaml").write_text(manifest)

    # Write agent entry point
    agent_code = dedent("""\
        \"\"\"Agent entry point.\"\"\"

        from agentstore_sdk import Agent


        class MyAgent(Agent):
            \"\"\"An interactive agent with conversational capabilities.\"\"\"

            def setup(self):
                \"\"\"Initialize agent state. Called once when the session starts.\"\"\"
                pass

            def handle_message(self, content: str, message_id: str):
                \"\"\"Handle an incoming user message.

                Args:
                    content: The user's message text.
                    message_id: Unique ID for this message exchange.
                \"\"\"
                # TODO: Implement your agent logic here
                self.send_response(
                    f"You said: {content}",
                    message_id=message_id,
                    done=True,
                )

            def teardown(self):
                \"\"\"Cleanup when the session ends.\"\"\"
                pass


        def create_agent():
            \"\"\"Entry point — returns an agent instance for the platform to run.\"\"\"
            return MyAgent()
    """)
    (agent_dir / "src" / "agent.py").write_text(agent_code)

    # Write requirements.txt
    (agent_dir / "requirements.txt").write_text(
        "# Add your agent dependencies here\nagentstore-sdk\n"
    )

    # Write .gitignore
    (agent_dir / ".gitignore").write_text("__pycache__/\n*.pyc\n.venv/\n")

    # Print summary
    console.print(f"\n[green bold]Created agent project:[/green bold] {name}/\n")
    console.print(f"  agent.yaml         Agent manifest")
    console.print(f"  src/agent.py       Entry point")
    console.print(f"  requirements.txt   Dependencies")
    console.print()
    console.print("[bold]Next steps:[/bold]")
    console.print(f"  1. Implement your logic in [cyan]src/agent.py[/cyan]")
    console.print(f"  2. Test locally: [cyan]agentstore run ./{name}[/cyan]")
