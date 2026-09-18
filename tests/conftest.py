import pytest
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import delete

from alembic import command
from app import db as db_module
from app.bootstrap.database import ALEMBIC_INI
from app.tables import metadata
from main import app


@pytest.fixture(scope='session', autouse=True)
def _test_schema():
    """Создаёт схему в общей тестовой БД tracker_test один раз за сессию тестов."""
    engine = db_module.get_engine()
    metadata.create_all(engine)
    command.stamp(Config(str(ALEMBIC_INI)), 'head')


def _truncate_all():
    engine = db_module.get_engine()
    with engine.begin() as conn:
        for table in reversed(metadata.sorted_tables):
            conn.execute(delete(table))


@pytest.fixture
def truncated_db():
    """Очищает все таблицы, без сида дефолтов - для тестов, которым нужна по-настоящему пустая БД."""
    _truncate_all()


@pytest.fixture
def clean_db(truncated_db):
    """Очищает все таблицы и заново сидит дефолтные statuses/tags/tasks - обычный базовый набор для теста."""
    conn = db_module.get_connection()
    try:
        db_module.seed_defaults(conn)
    finally:
        conn.close()


@pytest.fixture
def client(clean_db):
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def client_allow_server_errors(clean_db):
    """Как `client`, но возвращает 500-ответы вместо повторного выброса исключения — только для
    тестов, которые намеренно вызывают необработанное исключение, чтобы проверить саму обработку ошибок."""
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client


@pytest.fixture
def db_connection(clean_db):
    conn = db_module.get_connection()
    try:
        yield conn
    finally:
        conn.close()
