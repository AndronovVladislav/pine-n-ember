import sqlite3
import sys
from pathlib import Path

import pytest
from sqlalchemy import func, insert, select

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'scripts'))

from migrate_sqlite_to_postgres import migrate

from app.db import get_connection
from app.tables import statuses, tags


def _make_source_sqlite(tmp_path):
    db_path = tmp_path / 'source.db'
    conn = sqlite3.connect(db_path)
    conn.execute(
        'CREATE TABLE statuses (key TEXT PRIMARY KEY, label TEXT NOT NULL, color TEXT NOT NULL, position INTEGER NOT NULL)'
    )
    conn.execute(
        'CREATE TABLE tags (key TEXT PRIMARY KEY, label TEXT NOT NULL, bg TEXT NOT NULL, text_color TEXT NOT NULL)'
    )
    conn.execute('CREATE TABLE tasks (id TEXT PRIMARY KEY)')
    conn.execute('CREATE TABLE entities (id TEXT PRIMARY KEY)')
    conn.execute('CREATE TABLE entity_items (id TEXT PRIMARY KEY)')
    conn.execute("INSERT INTO statuses VALUES ('draft', 'Черновик', '#7FA37B', 0)")
    conn.execute("INSERT INTO tags VALUES ('work', 'work', '#1F3B2C', '#7FA37B')")
    conn.commit()
    conn.close()
    return db_path


@pytest.mark.spec('0006')
class TestMigrateSqliteToPostgres:
    def test_copies_rows_into_empty_destination(self, tmp_path, truncated_db):
        """
        Тест проверяет основной сценарий одноразового переноса: в пустой (только что
        накаченной миграциями, без единой строки) целевой БД после запуска migrate() должны
        появиться ровно те строки, что были в исходном sqlite-файле.

        Ожидание: после migrate(source) в statuses и tags целевой БД по одной строке,
        совпадающей с исходными
        """
        source = _make_source_sqlite(tmp_path)

        migrate(source)

        conn = get_connection()
        try:
            status_count = conn.execute(select(func.count()).select_from(statuses)).scalar_one()
            tag_count = conn.execute(select(func.count()).select_from(tags)).scalar_one()
        finally:
            conn.close()

        assert status_count == 1
        assert tag_count == 1

    def test_aborts_if_destination_not_empty(self, tmp_path, truncated_db):
        """
        Тест проверяет защиту от повторного/случайного запуска: если в целевой БД уже есть
        хоть одна строка в любой из переносимых таблиц, скрипт не должен молча дублировать
        данные - следует отказ с понятной ошибкой.

        Ожидание: migrate(source) завершает процесс с SystemExit, ничего не дописывая
        """
        conn = get_connection()
        try:
            conn.execute(insert(statuses).values(key='draft', label='Черновик', color='#7FA37B', position=0))
            conn.commit()
        finally:
            conn.close()

        source = _make_source_sqlite(tmp_path)

        with pytest.raises(SystemExit):
            migrate(source)
