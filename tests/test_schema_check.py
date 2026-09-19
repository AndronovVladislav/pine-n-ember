import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, text

import app.domains  # noqa: F401 — регистрирует все ORM-models доменов на Base.metadata
from app.bootstrap.database import ALEMBIC_INI, check_schema_is_current
from app.domains._base import Base


def _make_unstamped_sqlite(tmp_path):
    """Одноразовый sqlite-движок со схемой таблиц, но без строки alembic_version.

    check_schema_is_current() только сравнивает идентификаторы ревизий через собственные API
    Alembic - этой логике неважно, на каком диалекте SQL говорит соединение, поэтому одноразовый
    sqlite-файл - быстрый и изолированный способ протестировать её, не трогая общую тестовую
    Postgres-БД. Это тестовый инструмент, а не утверждение, что sqlite - поддерживаемый бэкенд
    приложения.
    """
    engine = create_engine(f'sqlite:///{tmp_path / "scratch.db"}')
    Base.metadata.create_all(engine)
    return engine


def _stamp_head(engine):
    head = ScriptDirectory.from_config(Config(str(ALEMBIC_INI))).get_current_head()
    with engine.begin() as conn:
        conn.execute(text('CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)'))
        conn.execute(text('INSERT INTO alembic_version (version_num) VALUES (:v)'), {'v': head})


@pytest.mark.spec('0005')
class TestCheckSchemaIsCurrent:
    def test_schema_not_stamped__raises_actionable_error(self, tmp_path):
        """
        Тест проверяет ситуацию, когда таблицы в БД созданы, но БД никогда не была отмечена как
        находящаяся на конкретной ревизии - это ровно то состояние, в котором должен
        предупредить, а не молча работать, механизм разделения "release" и "run".

        Ожидание: check_schema_is_current() бросает RuntimeError с упоминанием
        scripts/migrate.sh, чтобы было понятно, что делать
        """
        engine = _make_unstamped_sqlite(tmp_path)

        with engine.connect() as conn, pytest.raises(RuntimeError, match='scripts/migrate.sh'):
            check_schema_is_current(conn)

    def test_schema_stamped_at_head__does_not_raise(self, tmp_path):
        """
        Тест проверяет нормальную ситуацию: схема создана и явно застемплена на head той же
        миграцией, что описана в alembic/versions - состояние, в которое БД попадает после
        явного release-шага (scripts/migrate.sh).

        Ожидание: check_schema_is_current() не бросает исключение
        """
        engine = _make_unstamped_sqlite(tmp_path)
        _stamp_head(engine)

        with engine.connect() as conn:
            check_schema_is_current(conn)
