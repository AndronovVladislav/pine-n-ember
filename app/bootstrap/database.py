from pathlib import Path

from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import Connection

from app.db import get_connection

ALEMBIC_INI = Path(__file__).resolve().parent.parent.parent / 'alembic.ini'


def check_schema_is_current(conn: Connection) -> None:
    script = ScriptDirectory.from_config(Config(str(ALEMBIC_INI)))
    head = script.get_current_head()
    current = MigrationContext.configure(conn).get_current_revision()
    if current != head:
        raise RuntimeError(
            f'Database schema is out of date (current={current!r}, head={head!r}). '
            'Run ./scripts/migrate.sh before starting the server.'
        )


def bootstrap_database() -> None:
    conn = get_connection()
    try:
        check_schema_is_current(conn)
    finally:
        conn.close()
