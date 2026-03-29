"""CLI commands for MCP server management."""

import json
from pathlib import Path

import click
from rich.console import Console

console = Console()

_HOST_CONFIGS: dict[str, Path] = {
    "claude":         Path.home() / ".claude.json",
    "claude-desktop": Path.home() / "Library" / "Application Support" / "Claude" / "claude_desktop_config.json",
    "cursor":         Path.home() / ".cursor" / "mcp.json",
    "windsurf":       Path.home() / ".codeium" / "windsurf" / "mcp_config.json",
}

def _mcp_entry() -> dict:
    """Build the MCP server entry using the full path to the primordial executable."""
    import shutil
    cmd = shutil.which("primordial") or "primordial"
    return {"command": cmd, "args": ["mcp", "serve"]}


@click.group()
def mcp():
    """MCP server commands (serve, install)."""
    pass


@mcp.command(name="serve")
@click.option("--http", is_flag=True, default=False,
              help="Run in HTTP mode on port 19401 instead of stdio.")
def serve(http: bool):
    """Start the Primordial MCP server.

    \b
    In stdio mode (default), Claude Code and Cursor spawn this automatically
    via the config written by `primordial mcp install`.
    In HTTP mode, binds to localhost:19401 for direct connections.
    """
    from primordial.mcp_server import mcp as _mcp_app
    if http:
        _mcp_app.run(transport="streamable-http", host="127.0.0.1", port=19401)
    else:
        _mcp_app.run(transport="stdio")


@mcp.command(name="install")
@click.option("--host", type=click.Choice(["claude", "claude-desktop", "cursor", "windsurf"]),
              default=None, help="Target a specific host. Auto-detects if omitted.")
def install(host: str | None):
    """Register Primordial as an MCP server in your AI coding host's config.

    Writes the MCP server entry into the host's config file. Idempotent —
    safe to run multiple times.

    \b
    Hosts and config files:
      claude         → ~/.claude.json
      claude-desktop → ~/Library/Application Support/Claude/claude_desktop_config.json
      cursor         → ~/.cursor/mcp.json
      windsurf       → ~/.codeium/windsurf/mcp_config.json

    \b
    Examples:
      primordial mcp install
      primordial mcp install --host claude-desktop
    """
    if host:
        targets = [(host, _HOST_CONFIGS[host])]
    else:
        targets = _detect_hosts()

    if not targets:
        console.print("[yellow]No AI host config files detected.[/yellow]")
        console.print("[dim]Use --host to target a specific host, e.g.:[/dim]")
        console.print("[dim]  primordial mcp install --host claude[/dim]")
        return

    for name, config_path in targets:
        _install_for_host(name, config_path)

    console.print("\n[dim]Restart your IDE to connect to the Primordial MCP server.[/dim]")


def _detect_hosts() -> list[tuple[str, Path]]:
    """Auto-detect installed hosts. Claude Code CLI is always included."""
    targets = []
    for name, path in _HOST_CONFIGS.items():
        if name == "claude" or path.exists():
            targets.append((name, path))
    return targets


def _install_for_host(host_name: str, config_path: Path) -> None:
    """Merge the Primordial MCP entry into a single host config file."""
    if config_path.exists():
        try:
            with open(config_path) as f:
                config = json.load(f)
        except json.JSONDecodeError:
            console.print(f"[red]Could not parse {config_path}[/red] — skipping {host_name}")
            return
    else:
        config = {}

    mcp_servers = config.setdefault("mcpServers", {})
    if "primordial" in mcp_servers:
        console.print(f"[dim]{host_name}: already installed[/dim]")
        return

    mcp_servers["primordial"] = _mcp_entry()

    # Write atomically (temp file + rename)
    config_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = config_path.with_suffix(".tmp")
    try:
        with open(tmp_path, "w") as f:
            json.dump(config, f, indent=2)
            f.write("\n")
        tmp_path.replace(config_path)
    except OSError as e:
        console.print(f"[red]Failed to write {config_path}:[/red] {e}")
        tmp_path.unlink(missing_ok=True)
        return

    console.print(f"[green]✓[/green] {host_name} → {config_path}")
