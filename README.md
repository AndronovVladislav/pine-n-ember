# Pine & Ember

Личный трекер задач. FastAPI + SQLAlchemy Core + Postgres.

## Запуск

```bash
docker compose up -d db backup
./scripts/migrate.sh
uv run uvicorn main:app --reload
```

`.env.example` → `.env` для локальной конфигурации (`TRACKER_*`).

## Тесты

Тесты и линтер гоняются только через `scripts/run_tests.sh` (ruff check + pytest), не по отдельности.

Гоняются против отдельного сервиса `test-db` (см. `docker-compose.yml` и `pyproject.toml` →
`[tool.pytest_env]`) — нужно поднять его перед прогоном: `docker compose up -d test-db`.

## Миграции

- Применить все ожидающие миграции (единственный способ — приложение само их не накатывает,
  см. 12-factor build/release/run): `./scripts/migrate.sh`
- Создать новую миграцию с корректным возрастающим id (не случайный hex от Alembic):
  `./scripts/new_migration.sh "название миграции"`
- Приложение при старте только проверяет, что схема БД в актуальном состоянии (head), и отказывается
  стартовать, если это не так — с понятным сообщением, что нужно запустить `migrate.sh`

## Как устроен проект

- **Архитектурные принципы** — [ARCHITECTURE.md](ARCHITECTURE.md)
- **История решений** — `specs/NNNN-*.md`, каждая спека: контекст → критерии приёмки → что осознанно
  не делаем → реализация
- **План работ** — `TODO.md`
- Разработка идёт по Spec-Driven Development: спека → тесты (аппрув) → реализация
