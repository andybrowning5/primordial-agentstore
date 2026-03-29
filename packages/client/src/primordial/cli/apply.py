"""CLI command for previewing and applying agent workspace patches."""

import subprocess
from pathlib import Path

import click
from rich.console import Console
from rich.syntax import Syntax

from primordial.config import get_config

console = Console()


@click.command()
@click.argument("session_id", required=False, default=None)
@click.option("--last", is_flag=True, default=False,
              help="Apply the most recently saved patch.")
@click.option("--dry-run", is_flag=True, default=False,
              help="Preview the diff without applying changes.")
def apply(session_id: str | None, last: bool, dry_run: bool):
    """Preview and apply file changes from a completed agent session.

    Patches are saved automatically when an agent session ends. They are
    deleted after a successful apply. If git apply fails, the patch is
    preserved for retry.

    \b
    Usage:
      primordial apply <session_id>
      primordial apply --last
      primordial apply <session_id> --dry-run
    """
    config = get_config()
    patches_dir = config.patches_dir

    if last and not session_id:
        patch_path = _find_most_recent_patch(patches_dir)
        if patch_path is None:
            console.print("[red]No saved patches found.[/red]")
            console.print("[dim]Run an agent first, then stop it to save a patch.[/dim]")
            raise SystemExit(1)
        session_id = patch_path.stem
    elif session_id:
        patch_path = patches_dir / f"{session_id}.patch"
    else:
        console.print("[red]Provide a session_id or use --last.[/red]")
        console.print("  primordial apply <session_id>")
        console.print("  primordial apply --last")
        raise SystemExit(1)

    if not patch_path.exists():
        console.print(f"[red]Patch not found:[/red] {session_id}")
        console.print("[dim]Patches are only available after an agent session ends.[/dim]")
        raise SystemExit(1)

    patch_text = patch_path.read_text(errors="replace")
    if not patch_text.strip():
        console.print("[dim]No changes — patch is empty.[/dim]")
        patch_path.unlink(missing_ok=True)
        return

    _display_diff(patch_text, session_id)

    if dry_run:
        console.print("\n[dim]Dry run — no changes applied.[/dim]")
        return

    if not click.confirm("\nApply these changes?", default=False):
        console.print("[dim]Aborted.[/dim]")
        return

    result = subprocess.run(
        ["git", "apply", str(patch_path)],
        cwd=Path.cwd(),
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        console.print("[red]git apply failed:[/red]")
        if result.stderr.strip():
            console.print(result.stderr.strip())
        console.print()
        console.print(f"[dim]Patch preserved at: {patch_path}[/dim]")
        console.print(f"[dim]To apply manually: git apply {patch_path}[/dim]")
        raise SystemExit(1)

    patch_path.unlink(missing_ok=True)
    console.print("[green]✓ Applied.[/green] Patch deleted.")


def _display_diff(patch_text: str, session_id: str) -> None:
    """Show a file summary and colored unified diff."""
    files = _summarize_files(patch_text)
    if files:
        console.print(f"\n[bold]Changes from session {session_id}:[/bold]")
        for marker, name in files:
            if marker == "+":
                console.print(f"  [green]+[/green] {name}  [dim](new file)[/dim]")
            elif marker == "-":
                console.print(f"  [red]-[/red] {name}  [dim](deleted)[/dim]")
            else:
                console.print(f"  [yellow]~[/yellow] {name}  [dim](modified)[/dim]")
        console.print()
    syntax = Syntax(patch_text, "diff", theme="monokai", line_numbers=False)
    console.print(syntax)


def _summarize_files(patch_text: str) -> list[tuple[str, str]]:
    """Parse unified diff headers to extract (marker, filename) pairs."""
    files: list[tuple[str, str]] = []
    lines = patch_text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("--- ") and i + 1 < len(lines) and lines[i + 1].startswith("+++ "):
            src = line[4:]
            dst = lines[i + 1][4:]
            if src == "/dev/null":
                name = dst[2:] if dst.startswith("b/") else dst
                files.append(("+", name))
            elif dst == "/dev/null":
                name = src[2:] if src.startswith("a/") else src
                files.append(("-", name))
            else:
                name = dst[2:] if dst.startswith("b/") else dst
                files.append(("~", name))
            i += 2
            continue
        i += 1
    return files


def _find_most_recent_patch(patches_dir: Path) -> Path | None:
    """Return the most recently modified .patch file, or None."""
    patches = list(patches_dir.glob("*.patch"))
    if not patches:
        return None
    return max(patches, key=lambda p: p.stat().st_mtime)
