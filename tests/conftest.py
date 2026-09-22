import pytest
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import delete

import app.domains  # регистрирует все ORM-models доменов на Base.metadata
from alembic import command
from app import db as db_module
from app.bootstrap.database import ALEMBIC_INI
from app.domains._base import Base
from main import app


@pytest.fixture(scope='session', autouse=True)
def _test_schema():
    """Пересоздаёт схему в общей тестовой БД tracker_test один раз за сессию тестов - drop_all
    перед create_all, чтобы старая схема с прошлого запуска (до переименования/удаления колонок
    в моделях) не расходилась с текущим Base.metadata."""
    engine = db_module.get_engine()
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    command.stamp(Config(str(ALEMBIC_INI)), 'head')


def _truncate_all():
    engine = db_module.get_engine()
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(delete(table))


@pytest.fixture
def truncated_db():
    """Очищает все таблицы - приложение больше не сидит дефолтные данные само, тесты стартуют с пустой БД."""
    _truncate_all()


@pytest.fixture
def client(truncated_db):
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def client_allow_server_errors(truncated_db):
    """Как `client`, но возвращает 500-ответы вместо повторного выброса исключения — только для
    тестов, которые намеренно вызывают необработанное исключение, чтобы проверить саму обработку ошибок."""
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client


@pytest.fixture
def db_connection(truncated_db):
    conn = db_module.get_connection()
    try:
        yield conn
    finally:
        conn.close()
