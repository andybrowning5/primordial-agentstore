"""CLI command for scaffolding new agent projects."""

from pathlib import Path
from textwrap import dedent

import click
from rich.console import Console

console = Console()


def _scaffold_python(agent_dir: Path, agent_name: str, display_name: str, description: str) -> None:
    """Scaffold a Python SDK agent."""
    (agent_dir / "src").mkdir()

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

    agent_code = dedent("""\
        \"\"\"Agent entry point.\"\"\"

        from agentstore_sdk import Agent


        class MyAgent(Agent):

            def setup(self):
                pass

            def handle_message(self, content: str, message_id: str):
                # TODO: Implement your agent logic here
                self.send_response(
                    f"You said: {content}",
                    message_id=message_id,
                    done=True,
                )

            def teardown(self):
                pass


        def create_agent():
            return MyAgent()
    """)
    (agent_dir / "src" / "agent.py").write_text(agent_code)
    (agent_dir / "requirements.txt").write_text("# Add your agent dependencies here\nagentstore-sdk\n")

    console.print(f"  agent.yaml         Agent manifest")
    console.print(f"  src/agent.py       Entry point")
    console.print(f"  requirements.txt   Dependencies")


def _scaffold_node(agent_dir: Path, agent_name: str, display_name: str, description: str) -> None:
    """Scaffold a Node.js agent with NDJSON bridge."""
    manifest = dedent(f"""\
        name: "{agent_name}"
        display_name: "{display_name}"
        version: "0.1.0"
        description: "{description}"

        author:
          name: "Your Name"
          github: "your-github"

        runtime:
          language: "node"
          setup_command: "npm install"
          run_command: "node bridge.js"
          resources:
            max_memory: "4GB"
            max_duration: 300
            max_session_duration: 3600

        permissions:
          network:
            - domain: "api.anthropic.com"
              reason: "LLM API access"
            - domain: "registry.npmjs.org"
              reason: "Package installation"
          filesystem:
            workspace: "readwrite"
    """)
    (agent_dir / "agent.yaml").write_text(manifest)

    bridge_code = dedent("""\
        /**
         * NDJSON bridge — reads messages from stdin, processes them, writes responses to stdout.
         *
         * This is the AgentStore protocol adapter. Replace the handleMessage() function
         * with your agent logic.
         */
        const readline = require("readline");

        const rl = readline.createInterface({ input: process.stdin });

        function send(obj) {
          process.stdout.write(JSON.stringify(obj) + "\\n");
        }

        async function handleMessage(content, messageId) {
          // TODO: Replace with your agent logic
          send({ type: "response", content: `You said: ${content}`, message_id: messageId, done: true });
        }

        send({ type: "ready" });

        rl.on("line", async (line) => {
          try {
            const msg = JSON.parse(line);
            if (msg.type === "message") {
              await handleMessage(msg.content, msg.message_id);
            } else if (msg.type === "shutdown") {
              process.exit(0);
            }
          } catch {}
        });
    """)
    (agent_dir / "bridge.js").write_text(bridge_code)
    (agent_dir / "package.json").write_text(
        '{\n  "name": "' + agent_name + '",\n  "version": "0.1.0",\n  "private": true\n}\n'
    )

    console.print(f"  agent.yaml         Agent manifest")
    console.print(f"  bridge.js          NDJSON protocol bridge")
    console.print(f"  package.json       Node.js package")


@click.command()
@click.argument("name")
@click.option("--description", "-d", default=None, help="Short agent description")
@click.option("--language", "-l", type=click.Choice(["python", "node"]), default="python", help="Agent language")
def init(name: str, description: str | None, language: str):
    """Initialize a new agent project.

    \b
    Examples:
      agentstore init my-agent
      agentstore init my-agent --language node
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

    agent_dir.mkdir(parents=True)
    (agent_dir / ".gitignore").write_text("__pycache__/\n*.pyc\n.venv/\nnode_modules/\n")

    console.print(f"\n[green bold]Created agent project:[/green bold] {name}/\n")

    if language == "node":
        _scaffold_node(agent_dir, agent_name, display_name, description)
    else:
        _scaffold_python(agent_dir, agent_name, display_name, description)

    console.print()
    console.print("[bold]Next steps:[/bold]")
    console.print(f"  1. Implement your agent logic")
    console.print(f"  2. Test locally: [cyan]agentstore run ./{name}[/cyan]")
