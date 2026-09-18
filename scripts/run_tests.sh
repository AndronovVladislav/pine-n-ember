#!/usr/bin/env bash
# The single entry point for running the test suite - always ruff check + pytest together,
# so lint regressions never slip in on a "tests passed" green light.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo 'Running ruff...'
uv run ruff check .

echo 'Running pytest...'
uv run pytest "$@"
