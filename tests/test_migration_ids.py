import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'scripts'))

from migration_ids import next_migration_id


@pytest.mark.spec('0001')
class TestNextMigrationId:
    def test_empty_versions_dir__returns_first_id(self, tmp_path):
        """
        Тест проверяет вычисление id для самой первой миграции, когда в директории versions
        ещё нет ни одного файла миграции.

        Ожидание: возвращается "0001"
        """
        assert next_migration_id(tmp_path) == '0001'

    def test_existing_ids_with_gap__returns_max_plus_one(self, tmp_path):
        """
        Тест проверяет, что следующий id считается по максимальному существующему id, а не по
        количеству файлов в директории - если, например, миграция 0002 была позже удалена
        вручную, счётчик не должен "откатиться" и выдать уже использованный id повторно.

        Ожидание: при наличии 0001_a.py и 0003_b.py следующий id - "0004", а не "0003" (было бы
        при подсчёте количества файлов) и не "0002" (был бы при простом инкременте последнего по
        алфавиту)
        """
        (tmp_path / '0001_a.py').touch()
        (tmp_path / '0003_b.py').touch()

        assert next_migration_id(tmp_path) == '0004'

    def test_non_migration_files_are_ignored(self, tmp_path):
        """
        Тест проверяет, что файлы, не соответствующие конвенции именования миграций
        (NNNN_slug.py), не влияют на вычисление следующего id.

        Ожидание: __pycache__-подобные файлы и файл без числового префикса игнорируются,
        следующий id считается только по настоящим файлам миграций
        """
        (tmp_path / '0002_real_migration.py').touch()
        (tmp_path / '__init__.py').touch()
        (tmp_path / 'README.py').touch()

        assert next_migration_id(tmp_path) == '0003'
