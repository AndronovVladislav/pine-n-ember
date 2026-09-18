#!/usr/bin/env bash
# Создаёт новую миграцию Alembic со строго возрастающим 4-значным id (0001, 0002, ...).
#
# Единственный поддерживаемый способ создавать миграции в этом проекте — прямой запуск
# `alembic revision` оставляет id на усмотрение случайного hex-генератора Alembic, что ломает
# конвенцию возрастающих id. Использование:
#   ./scripts/new_migration.sh "add foo column"
set -euo pipefail

if [ $# -ne 1 ]; then
    echo "Usage: $0 \"<migration message>\"" >&2
    exit 1
fi

MESSAGE="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
VERSIONS_DIR="$PROJECT_ROOT/alembic/versions"

cd "$PROJECT_ROOT"
NEXT_ID=$(uv run python scripts/migration_ids.py "$VERSIONS_DIR")

echo "Next migration id: $NEXT_ID"
uv run alembic revision --autogenerate --rev-id="$NEXT_ID" -m "$MESSAGE"
