# 0006 — Postgres + бэкапы каждые 3 часа

**Статус:** done

**Примечание по портам:** порт `5432` на хосте оказался занят чужим SSH-туннелем — сервис `db` в
`docker-compose.yml` проброшен на `5431:5432` (внутри сети контейнеров всё равно `5432`). Все
default-значения (`app/settings.py`, `.env.example`, `pyproject.toml`) используют `5431`.

**Примечание (задним числом):** изначально тестовая БД создавалась init-скриптом
(`db/init-test-db.sql` → `CREATE DATABASE tracker_test;`) внутри того же Postgres-сервера, что и
рабочая БД. Заменено на отдельный сервис `test-db` со своим `POSTGRES_DB` — образ Postgres создаёт БД
самостоятельно при первом старте, init-скрипт не нужен; `tmpfs` вместо volume, так как тестовые данные
одноразовые и эфемерность даже полезна. Порт тестовой БД — `5430`.

## Контекст

Последний пункт `TODO.md`. По решению пользователя: Postgres поднимается через Docker Compose, тесты
тоже переводятся на Postgres (единый движок везде, без риска расхождения диалектов), бэкапы — сайдкар-
контейнер в том же `docker-compose.yml` (без внешней настройки cron/launchd). Интервал бэкапа —
3 часа (не 1, как было в исходной формулировке TODO), хранение — 24 часа.

SQLite полностью выводится из эксплуатации, кроме одного точечного использования: тест
`check_schema_is_current()` использует одноразовый sqlite-движок как быстрый тестовый инструмент для
чисто dialect-agnostic логики сравнения ревизий — это не "поддержка sqlite как бэкенда", а обычная
техника юнит-тестирования.

## Критерии приёмки

1. `docker-compose.yml` поднимает Postgres для реальных данных (`db`, с волюмом) и отдельный сервис
   `test-db` для тестовой БД (`POSTGRES_DB=tracker_test`, `tmpfs` — тестовые данные не персистентны).
2. `app/settings.py`: `DB_PATH` заменён на `DATABASE_URL` (default указывает на compose-сервис).
   `.env.example` обновлён.
3. `app/db.py`: `get_engine()` — закешированный синглтон (не пересоздаётся на каждый вызов, как было
   оправдано для sqlite, но расточительно для Postgres с его connection pool); sqlite-специфичный
   `PRAGMA foreign_keys` удалён — Postgres обеспечивает FK всегда.
4. `alembic/env.py` — URL берётся из `settings.DATABASE_URL`; `render_as_batch` убран (это был
   sqlite-костыль под ограниченный `ALTER TABLE`).
5. Существующая миграция `0001_initial_schema.py` применяется на чистый Postgres без правок.
6. Есть `docker-compose.yml`-сервис `backup`: тот же образ Postgres (гарантия совместимой версии
   `pg_dump`), каждые 3 часа делает `pg_dump` в примонтированную `./backups/`, удаляет дампы старше
   24 часов. Бэкапы переживают `docker compose down`.
7. Есть одноразовый скрипт `scripts/migrate_sqlite_to_postgres.py` — переносит реальные данные из
   старого `tracker.db` в Postgres в правильном порядке FK, с проверкой "назначение пустое" перед
   копированием.
8. Тесты переведены на общую тестовую Postgres-БД (`tracker_test`): схема создаётся и стемпится один
   раз за сессию, каждый тест получает чистые данные через truncate + сид дефолтов.
9. `backups/` добавлен в `.gitignore`.
10. Реальные данные пользователя переносятся в Postgres, проверяются на совпадение количества строк по
    каждой таблице; исходный `tracker.db` не удаляется.

## Осознанно не делаем

- Не тестируем bash-цикл бэкапа юнит-тестами — проверяем вручную через `docker compose up` и осмотр
  `./backups/` (та же логика, что и для `scripts/migrate.sh`).
- Не добавляем connection pooling тюнинг/read-replicas — дефолтный `create_engine(url)` достаточен для
  однопользовательского инструмента.
- Не удаляем `tracker.db` после переноса — архивная копия остаётся на диске.

## Реализация

- `docker-compose.yml` — сервисы `db` (postgres:17-alpine, healthcheck, volume для реальных данных),
  `test-db` (тот же образ, `POSTGRES_DB=tracker_test`, `tmpfs` вместо volume — отдельный контейнер,
  БД создаётся образом автоматически через `POSTGRES_DB`, без init-скрипта) и `backup` (тот же образ,
  `scripts/backup-loop.sh`, volume на `./backups`)
- `scripts/backup-loop.sh` — `pg_dump` с таймстампом → `find ... -mmin +1440 -delete` → `sleep 10800`
- `app/settings.py`, `pyproject.toml` (`psycopg[binary]`)
- `app/db.py` — синглтон `get_engine()`, без sqlite PRAGMA
- `alembic/env.py` — URL из settings, без `render_as_batch`
- `scripts/migrate_sqlite_to_postgres.py`
- `.env.example`, `.gitignore`
- `tests/conftest.py` — session-scoped создание схемы, `clean_db` вместо `db_path`, `pytest-env` для
  `TRACKER_DATABASE_URL` тестовой БД
- `tests/test_schema_check.py` — адаптация под синглтон-движок (sqlite-инструмент для юнит-теста логики,
  Postgres для теста `bootstrap_database()`)

## Тесты (TDD, `@pytest.mark.spec("0006")`)

`tests/test_migrate_sqlite_to_postgres.py` — небольшая sqlite-БД с парой строк как источник, пустая
(truncated, без сида) тестовая Postgres как назначение; проверяем, что скрипт копирует строки корректно
и что он отказывается работать, если в назначении уже есть данные.
