"""Одноразовый перенос данных из старого sqlite tracker.db в настроенную Postgres-БД.

Запускать один раз, после того как `scripts/migrate.sh` создал схему в Postgres:

    uv run python scripts/migrate_sqlite_to_postgres.py [путь-к-старому-tracker.db]

Безопасно запускать только когда таблицы назначения пусты - иначе прерывается, чтобы избежать
дублирования строк при повторном запуске.
"""

import sqlite3
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from sqlalchemy import func, insert, select

from app.db import get_connection
from app.tables import entities, entity_items, statuses, tags, tasks

DEFAULT_SQLITE_PATH = PROJECT_ROOT / 'tracker.db'
TABLE_ORDER = [statuses, tags, tasks, entities, entity_items]


def migrate(sqlite_path: Path) -> None:
    sqlite_conn = sqlite3.connect(sqlite_path)
    sqlite_conn.row_factory = sqlite3.Row

    pg_conn = get_connection()
    try:
        for table in TABLE_ORDER:
            existing = pg_conn.execute(select(func.count()).select_from(table)).scalar_one()
            if existing:
                print(
                    f'Table {table.name!r} already has {existing} row(s) in the destination database. '
                    'Aborting to avoid duplicating data.',
                    file=sys.stderr,
                )
                sys.exit(1)

        for table in TABLE_ORDER:
            rows = [dict(row) for row in sqlite_conn.execute(f'SELECT * FROM {table.name}')]
            if rows:
                pg_conn.execute(insert(table), rows)
            print(f'Copied {len(rows)} row(s) into {table.name!r}')

        pg_conn.commit()
    finally:
        pg_conn.close()
        sqlite_conn.close()


if __name__ == '__main__':
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SQLITE_PATH
    migrate(path)
