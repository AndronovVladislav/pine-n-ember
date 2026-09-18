#!/usr/bin/env bash
# Явный "release"-шаг: применяет все ожидающие миграции Alembic до head.
#
# Само приложение больше не накатывает миграции при старте (12-factor: разделение
# build/release/run) - оно только проверяет, что схема уже на head, и отказывается стартовать
# в противном случае. Запускать перед стартом/рестартом сервера, когда добавлена новая миграция.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"
uv run alembic upgrade head
