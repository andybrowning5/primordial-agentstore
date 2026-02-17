"""CLI command for running agents."""

import json
import time
from pathlib import Path

import click
from rich.console import Console

from agentstore.config import get_config
from agentstore.manifest import load_manifest
from agentstore.security.key_vault import KeyVault
from agentstore.security.permissions import PermissionManager
from agentstore.sandbox.manager import SandboxManager

console = Console()


@click.command()
@click.argument("agent_path")
@click.option("--task", "-t", default=None, help="Task description for the agent")
@click.option("--workspace", "-w", default=".", help="Workspace directory to mount")
@click.option("--model", "-m", default=None, help="Override model (provider:model format)")
@click.option("--timeout", default=None, type=int, help="Timeout in seconds")
@click.option("--json-output", is_flag=True, help="Output structured JSON (for agent-to-agent)")
def run(
    agent_path: str,
    task: str | None,
    workspace: str,
    model: str | None,
    timeout: int | None,
    json_output: bool,
):
    """Run an agent from a local path or installed agent name.

    AGENT_PATH can be a local directory (./my-agent) or an installed agent name.
    """
    config = get_config()

    # Resolve agent path
    agent_dir = Path(agent_path)
    if not agent_dir.exists():
        installed = config.agents_dir / agent_path
        if installed.exists():
            agent_dir = installed
        else:
            console.print(f"[red]Agent not found:[/red] {agent_path}")
            raise SystemExit(1)

    # Load manifest
    try:
        manifest = load_manifest(agent_dir)
    except (FileNotFoundError, ValueError) as e:
        console.print(f"[red]Invalid agent:[/red] {e}")
        raise SystemExit(1)

    # Check permissions
    perm_mgr = PermissionManager(config.agents_dir)
    if perm_mgr.needs_approval(manifest):
        console.print(f"\n[bold]Agent: {manifest.display_name}[/bold] v{manifest.version}")
        console.print(f"[dim]{manifest.description}[/dim]\n")
        console.print("[yellow]This agent requests the following permissions:[/yellow]\n")
        for line in perm_mgr.format_permissions_for_display(manifest):
            console.print(f"  {line}")
        console.print()
        if not click.confirm("Approve these permissions?"):
            console.print("[dim]Aborted.[/dim]")
            raise SystemExit(0)
        perm_mgr.save_approved_permissions(manifest.name, manifest)

    # Get API keys
    vault = KeyVault(config.keys_file)
    provider = manifest.runtime.default_model.provider
    if model:
        provider = model.split(":")[0] if ":" in model else provider

    api_key = vault.get_key(provider)
    if not api_key:
        console.print(f"[red]No API key found for provider '{provider}'.[/red]")
        console.print(f"Add one with: agentstore keys add {provider} <your-key>")
        raise SystemExit(1)

    if not task:
        task = click.prompt("Enter task for the agent")

    sandbox_timeout = timeout or manifest.runtime.resources.max_duration

    if not json_output:
        console.print(f"\n[bold]Running {manifest.display_name}[/bold] v{manifest.version}")
        console.print(f"[dim]Model: {provider}:{manifest.runtime.default_model.model}[/dim]")
        console.print(f"[dim]Timeout: {sandbox_timeout}s[/dim]\n")

    env_vars = vault.get_env_vars([provider])
    manager = SandboxManager()

    start_time = time.time()
    try:
        result = manager.run_agent(
            agent_dir=agent_dir,
            manifest=manifest,
            task=task,
            workspace=Path(workspace).resolve(),
            env_vars=env_vars,
            timeout=sandbox_timeout,
        )
        result["duration_seconds"] = round(time.time() - start_time, 2)

        if json_output:
            click.echo(json.dumps(result, indent=2))
        else:
            if result.get("status") == "success":
                console.print("[green]Agent completed successfully[/green]")
                if result.get("output"):
                    console.print(result["output"])
            else:
                console.print(f"[red]Agent failed:[/red] {result.get('error', 'Unknown error')}")
                raise SystemExit(1)

    except Exception as e:
        if json_output:
            click.echo(json.dumps({"status": "error", "error": str(e)}, indent=2))
        else:
            console.print(f"\n[red]Error running agent:[/red] {e}")
        raise SystemExit(1)
