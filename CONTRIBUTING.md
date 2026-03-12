# Contributing to Primordial AgentStore

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

```bash
git clone https://github.com/andybrowning5/primordial-agentstore.git
cd primordial-agentstore
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

Requires Python 3.11+.

## Making Changes

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Run the linter: `ruff check .`
4. Open a pull request against `main`

PRs require one approving review before merge.

## Reporting Bugs

Open a GitHub issue with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Python version and OS

## Building Agents

If you want to build and publish an agent rather than contribute to the CLI itself, see the [developer docs](docs/developers/building-agents.md).

## Code Style

This project uses [ruff](https://github.com/astral-sh/ruff) for linting. Run `ruff check .` before submitting a PR.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
