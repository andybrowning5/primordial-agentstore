"""CLI commands for publishing and initializing agents."""

from pathlib import Path

import click
from rich.console import Console

from agentstore.manifest import load_manifest

console = Console()


@click.command()
@click.argument("name")
@click.option("--category", "-c", default="general", help="Agent category")
def init(name: str, category: str):
    """Initialize a new agent project from template."""
    agent_dir = Path(name)
    if agent_dir.exists():
        console.print(f"[red]Directory '{name}' already exists.[/red]")
        raise SystemExit(1)

    agent_dir.mkdir(parents=True)
    (agent_dir / "src").mkdir()
    (agent_dir / "prompts").mkdir()
    (agent_dir / "tests").mkdir()

    manifest_content = f'''name: "{name}"
display_name: "{name.replace('-', ' ').title()}"
version: "0.1.0"
description: "A specialized agent for..."
category: "{category}"
tags: []

author:
  name: "Your Name"
  github: "your-github"

runtime:
  language: "python"
  python_version: ">=3.11"
  entry_point: "src/agent:run"
  dependencies: "requirements.txt"
  default_model:
    provider: "anthropic"
    model: "claude-sonnet-4-5-20250929"
  resources:
    max_memory: "2GB"
    max_cpu: 2
    max_duration: 300

system_prompt: "prompts/system.md"

permissions:
  network:
    - domain: "api.anthropic.com"
      reason: "LLM API access"
  filesystem:
    workspace: "readwrite"
  delegation:
    enabled: false

interface:
  input:
    format: "text"
    schema:
      type: "object"
      properties:
        task:
          type: "string"
      required: ["task"]
  output:
    format: "json"
'''
    (agent_dir / "agent.yaml").write_text(manifest_content)

    (agent_dir / "prompts" / "system.md").write_text(
        f"You are {name.replace('-', ' ').title()}, a specialized AI agent.\n\n"
        "Your task is to help the user with their request.\n"
    )

    (agent_dir / "src" / "agent.py").write_text(
        '"""Agent entry point."""\n\n\n'
        "def run(task: str, workspace: str = \".\") -> dict:\n"
        '    """Main agent entry point called by the Agent Store platform."""\n'
        "    # TODO: Implement your agent logic here\n"
        "    return {\n"
        '        "status": "success",\n'
        '        "output": f"Processed task: {task}",\n'
        "    }\n"
    )

    (agent_dir / "requirements.txt").write_text("# Add your agent dependencies here\n")

    (agent_dir / "tests" / "test_agent.py").write_text(
        '"""Basic agent tests."""\n\n'
        "from src.agent import run\n\n\n"
        "def test_basic_run():\n"
        '    result = run(task="test task", workspace=".")\n'
        '    assert result["status"] == "success"\n'
    )

    console.print(f"[green]Agent project initialized:[/green] {name}/")
    console.print(f"  agent.yaml        - Agent manifest")
    console.print(f"  src/agent.py      - Agent entry point")
    console.print(f"  prompts/system.md - System prompt")
    console.print(f"  requirements.txt  - Dependencies")
    console.print(f"  tests/            - Test directory")
    console.print(f"\nNext steps:")
    console.print(f"  1. Edit agent.yaml with your details")
    console.print(f"  2. Implement your agent in src/agent.py")
    console.print(f"  3. Test locally: agentstore run ./{name}")
    console.print(f"  4. Publish: agentstore publish ./{name}")


@click.command()
@click.argument("agent_path", default=".")
def publish(agent_path: str):
    """Publish an agent to the Agent Store."""
    agent_dir = Path(agent_path)

    try:
        manifest = load_manifest(agent_dir)
    except (FileNotFoundError, ValueError) as e:
        console.print(f"[red]Invalid agent:[/red] {e}")
        raise SystemExit(1)

    console.print(f"\n[bold]Publishing {manifest.display_name}[/bold] v{manifest.version}")
    console.print(f"[dim]{manifest.description}[/dim]")
    console.print(f"Permission tier: {manifest.compute_permission_tier().name}")

    # TODO: Implement actual publishing (package, checksum, upload)
    console.print("\n[dim]Publishing requires backend connection. Coming soon.[/dim]")
