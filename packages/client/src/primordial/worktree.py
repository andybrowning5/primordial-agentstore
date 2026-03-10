"""Git worktree manager for agent isolation."""

import subprocess
from pathlib import Path


class WorktreeError(Exception):
    pass


class WorktreeManager:
    """Create and manage git worktrees for agent isolation.

    Each agent+session gets a worktree at ../{repo}--{agent}--{session}/
    on branch primordial/{agent}/{session}, branching from the current HEAD.
    Multiple instances of the same agent get separate branches.
    """

    def __init__(self, repo_root: Path, session_name: str = ""):
        self.repo_root = repo_root.resolve()
        self.repo_name = self.repo_root.name
        self.session_name = session_name

    def _run(self, *args: str, check: bool = True) -> subprocess.CompletedProcess:
        result = subprocess.run(
            ["git", *args],
            cwd=str(self.repo_root),
            capture_output=True, text=True, timeout=30,
        )
        if check and result.returncode != 0:
            raise WorktreeError(result.stderr.strip() or f"git {args[0]} failed")
        return result

    def _instance_key(self, agent_name: str) -> str:
        """Build the unique key for this agent instance."""
        if self.session_name:
            return f"{agent_name}--{self.session_name}"
        return agent_name

    def _worktree_path(self, agent_name: str) -> Path:
        return self.repo_root.parent / f"{self.repo_name}--{self._instance_key(agent_name)}"

    def _branch_name(self, agent_name: str) -> str:
        if self.session_name:
            return f"primordial/{agent_name}--{self.session_name}"
        return f"primordial/{agent_name}"

    def create(self, agent_name: str) -> Path:
        """Create a worktree for an agent. Returns the worktree path.

        Branch starts from current HEAD. If the worktree already exists,
        returns its path without recreating.
        """
        wt_path = self._worktree_path(agent_name)
        branch = self._branch_name(agent_name)

        if wt_path.exists():
            return wt_path

        self._run("worktree", "add", str(wt_path), "-b", branch)
        return wt_path

    def remove(self, agent_name: str, delete_branch: bool = False) -> None:
        """Remove a worktree and optionally its branch."""
        wt_path = self._worktree_path(agent_name)
        branch = self._branch_name(agent_name)

        if wt_path.exists():
            self._run("worktree", "remove", str(wt_path), "--force", check=False)

        if delete_branch:
            self._run("branch", "-D", branch, check=False)

        self._run("worktree", "prune", check=False)

    def list_active(self) -> list[dict]:
        """List all primordial-managed worktrees."""
        result = self._run("worktree", "list", "--porcelain", check=False)
        worktrees = []
        current: dict = {}

        for line in result.stdout.splitlines():
            if line.startswith("worktree "):
                if current:
                    worktrees.append(current)
                current = {"path": line.split(" ", 1)[1]}
            elif line.startswith("branch "):
                current["branch"] = line.split(" ", 1)[1].replace("refs/heads/", "")

        if current:
            worktrees.append(current)

        # Filter to primordial-managed worktrees
        managed = []
        for wt in worktrees:
            branch = wt.get("branch", "")
            if not branch.startswith("primordial/"):
                continue

            agent_name = branch.removeprefix("primordial/")
            ahead = self._run(
                "rev-list", "--count", f"HEAD..{branch}", check=False,
            )
            count = int(ahead.stdout.strip()) if ahead.returncode == 0 else 0

            managed.append({
                "name": agent_name,
                "path": wt["path"],
                "branch": branch,
                "ahead": count,
            })

        return managed

    def diff_summary(self, agent_name: str) -> str:
        """Show what changed on this agent's branch vs main."""
        branch = self._branch_name(agent_name)
        result = self._run("diff", "--stat", f"HEAD...{branch}", check=False)
        return result.stdout.strip() if result.returncode == 0 else ""

    def commit_worktree(self, agent_name: str, message: str = "") -> bool:
        """Stage and commit any uncommitted changes in the worktree."""
        wt_path = self._worktree_path(agent_name)
        if not wt_path.exists():
            return False

        msg = message or f"primordial: {agent_name} changes"

        # Check if there are changes to commit
        status = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=str(wt_path), capture_output=True, text=True, timeout=10,
        )
        if not status.stdout.strip():
            return False

        subprocess.run(
            ["git", "add", "-A"],
            cwd=str(wt_path), capture_output=True, timeout=10,
        )
        subprocess.run(
            ["git", "-c", "user.name=primordial", "-c", "user.email=noreply",
             "commit", "-m", msg],
            cwd=str(wt_path), capture_output=True, timeout=10,
        )
        return True
