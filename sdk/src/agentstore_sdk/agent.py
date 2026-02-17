"""Base agent class for Agent Store agents."""

from __future__ import annotations

import glob as glob_module
import os
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Optional


class AgentInput:
    """Structured input for an agent run."""

    def __init__(self, task: str, workspace: str = ".", **kwargs: Any):
        self.task = task
        self.workspace = Path(workspace)
        self.extra = kwargs


class AgentOutput:
    """Structured output from an agent run."""

    def __init__(self, status: str = "success", output: Any = None, error: Optional[str] = None):
        self.status = status
        self.output = output
        self.error = error

    def to_dict(self) -> dict:
        result = {"status": self.status}
        if self.output is not None:
            result["output"] = self.output
        if self.error is not None:
            result["error"] = self.error
        return result


class BaseAgent(ABC):
    """Base class for Agent Store agents.

    Example:
        class MyAgent(BaseAgent):
            def run(self, input: AgentInput) -> AgentOutput:
                files = self.glob(input.workspace, "**/*.py")
                return AgentOutput(output={"files": files})
    """

    def __init__(self):
        self._tools: dict[str, callable] = {}

    @abstractmethod
    def run(self, input: AgentInput) -> AgentOutput:
        """Main entry point called by the platform."""
        ...

    def read_file(self, path: str | Path) -> str:
        return Path(path).read_text()

    def write_file(self, path: str | Path, content: str) -> None:
        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content)

    def glob(self, directory: str | Path, pattern: str) -> list[str]:
        return sorted(glob_module.glob(str(Path(directory) / pattern), recursive=True))

    def get_env(self, key: str) -> Optional[str]:
        return os.environ.get(key)
