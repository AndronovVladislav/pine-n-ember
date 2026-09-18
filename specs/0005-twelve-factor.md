# 0005 — 12-factor app (фактор V: build, release, run)

**Статус:** done

## Контекст

TODO-пункт: придерживаться идеи 12-factor app, без фанатизма. Аудит по всем 12 факторам:

| Фактор                 | Статус                                                                                                                   |
|------------------------|--------------------------------------------------------------------------------------------------------------------------|
| I. Codebase            | готово — один git-репозиторий                                                                                            |
| II. Dependencies       | готово — `pyproject.toml` + `uv.lock`, явные версии                                                                      |
| III. Config            | готово — `app/settings.py` (pydantic-settings, env-переменные), spec 0002                                                |
| IV. Backing services   | частично — sqlite-файл не "attached resource" в полном смысле; решится при переходе на Postgres (отдельный TODO-пункт)   |
| V. Build, release, run | единственный реально недоделанный — миграции выполняются внутри `lifespan` при каждом старте, смешивая "release" и "run" |
| VI. Processes          | готово — процесс stateless, всё состояние в БД                                                                           |
| VII. Port binding      | готово — `settings.HOST`/`settings.PORT`, spec 0002                                                                      |
| VIII. Concurrency      | неприменимо для однопользовательского локального инструмента                                                             |
| IX. Disposability      | готово — uvicorn обрабатывает graceful shutdown "из коробки"                                                             |
| X. Dev/prod parity     | частично — тот же вопрос, что и IV, решится вместе с Postgres                                                            |
| XI. Logs               | готово — структурированные логи в stdout, spec 0002                                                                      |
| XII. Admin processes   | готово — `scripts/new_migration.sh`, `scripts/migration_ids.py`, spec 0001                                               |

Решаем фактор V: миграции выносятся в отдельный явный "release"-шаг, старт приложения ("run") миграции
больше не выполняет — только проверяет, что схема БД уже актуальна, и падает с понятным сообщением,
если нет.

## Критерии приёмки

1. Есть `scripts/migrate.sh` — явный release-шаг, выполняющий `alembic upgrade head`. Это единственный
   способ применить миграции; приложение само их больше не накатывает.
2. При старте приложения (`bootstrap_database()`) выполняется проверка: текущая ревизия БД совпадает с
   head-ревизией в `alembic/versions`. Если нет — приложение падает с понятным сообщением ("накатите
   `scripts/migrate.sh`"), а не тихо продолжает работать на устаревшей схеме.
3. Сид дефолтных данных (`seed_defaults`) остаётся в startup-пути — идемпотентная операция с данными, а
   не миграция схемы, тянуть её в отдельный release-шаг незачем.
4. Реальная `tracker.db` уже застемплена на `0001` (head) — после изменения приложение стартует без
   дополнительных действий.
5. Тесты по-прежнему создают схему через `metadata.create_all()` (без реального алембика); проверка
   "схема на head" в тестовом окружении управляется явно через `alembic stamp head` в фикстуре.

## Осознанно не делаем

- Не трогаем факторы IV и X (backing services, dev/prod parity) — они завязаны на переход на Postgres,
  это отдельный TODO-пункт, а не часть этого.
- Не добавляем concurrency-механизмы (фактор VIII) — неприменимо для однопользовательского локального
  инструмента.

## Реализация

- `app/bootstrap/database.py` — `bootstrap_database()` больше не вызывает `command.upgrade(...)`.
  Вместо этого: `check_schema_is_current(conn)` (новая функция, сравнивает текущую ревизию БД с
  head-ревизией через `alembic.runtime.migration.MigrationContext` и `alembic.script.ScriptDirectory`,
  при расхождении — `RuntimeError` с понятным сообщением) + `seed_defaults(conn)`, как и раньше.
- `scripts/migrate.sh` (новый) — тонкая обёртка над `alembic upgrade head`.
- `tests/conftest.py` — фикстура `db_path`: после `metadata.create_all(engine)` дополнительно
  `command.stamp(Config(...), "head")`.

## Тесты (TDD, помечены `@pytest.mark.spec("0005")`)

`tests/test_schema_check.py`:

- схема создана, но не застемплена → `check_schema_is_current()` бросает `RuntimeError` с текстом,
  упоминающим `scripts/migrate.sh`
- схема создана и застемплена на head → исключения нет
- `bootstrap_database()` на правильно застемпленной БД отрабатывает без ошибок и сидит дефолты
