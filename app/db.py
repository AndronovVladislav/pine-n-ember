from sqlalchemy import Connection, create_engine, func, insert, select
from sqlalchemy.engine import Engine

from app.settings import settings
from app.tables import statuses, tags

DEFAULT_STATUSES = [
    ('draft', 'Draft', '#7FA37B', 0),
    ('progress', 'In Progress', '#FFB454', 1),
    ('review', 'Review', '#FF9E64', 2),
    ('done', 'Done', '#4F6E58', 3),
]

DEFAULT_TAGS = [
    ('work', 'work', '#1F3B2C', '#7FA37B'),
    ('life', 'life', '#1F3B2C', '#FFB454'),
]

_engine: Engine | None = None


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        _engine = create_engine(settings.DATABASE_URL)
    return _engine


def get_connection() -> Connection:
    return get_engine().connect()


def seed_defaults(conn: Connection) -> None:
    count = conn.execute(select(func.count()).select_from(statuses)).scalar_one()
    if count != 0:
        return

    conn.execute(
        insert(statuses),
        [{'key': k, 'label': label, 'color': color, 'position': pos} for k, label, color, pos in DEFAULT_STATUSES],
    )
    conn.execute(
        insert(tags),
        [{'key': k, 'label': label, 'bg': bg, 'text_color': text_color} for k, label, bg, text_color in DEFAULT_TAGS],
    )
    conn.commit()
