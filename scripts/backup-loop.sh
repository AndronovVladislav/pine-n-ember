#!/usr/bin/env bash
# Работает внутри compose-сервиса `backup`. Сразу делает pg_dump, затем каждые 3 часа,
# и удаляет дампы старше 24 часов. Вынесено в отдельный скрипт (не заинлайнено в
# docker-compose.yml), чтобы его можно было читать и менять, не трогая compose-файл.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_MINUTES=1440   # 24 часа
INTERVAL_SECONDS=10800   # 3 часа

mkdir -p "$BACKUP_DIR"

while true; do
    timestamp=$(date -u +%Y%m%dT%H%M%SZ)
    dump_file="$BACKUP_DIR/tracker-$timestamp.sql"
    echo "[backup] dumping to $dump_file"
    PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" > "$dump_file"

    echo "[backup] removing dumps older than $RETENTION_MINUTES minutes"
    find "$BACKUP_DIR" -name 'tracker-*.sql' -mmin "+$RETENTION_MINUTES" -delete

    echo "[backup] sleeping $INTERVAL_SECONDS seconds"
    sleep "$INTERVAL_SECONDS"
done
