from sqlalchemy import Connection, create_engine
from sqlalchemy.engine import Engine

from app.settings import settings

_engine: Engine | None = None


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        _engine = create_engine(settings.DATABASE_URL)
    return _engine


def get_connection() -> Connection:
    return get_engine().connect()
