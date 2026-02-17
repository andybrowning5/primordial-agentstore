"""Tool decorator for agent capabilities."""

from __future__ import annotations

from functools import wraps
from typing import Any, Callable


def tool(description: str = "", name: str | None = None) -> Callable:
    """Decorator to register a method as an agent tool.

    Example:
        class MyAgent(BaseAgent):
            @tool(description="Analyze a Python file")
            def analyze_file(self, path: str) -> dict:
                content = self.read_file(path)
                return {"path": path, "lines": len(content.splitlines())}
    """

    def decorator(func: Callable) -> Callable:
        func._is_tool = True
        func._tool_name = name or func.__name__
        func._tool_description = description

        @wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            return func(*args, **kwargs)

        wrapper._is_tool = True
        wrapper._tool_name = func._tool_name
        wrapper._tool_description = func._tool_description
        return wrapper

    return decorator
