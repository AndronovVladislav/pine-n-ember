# 0002 — Prod-ready backend

**Статус:** done

## Контекст

`TODO.md`, пункт 2: привести backend в prod-ready состояние. Ориентир — паттерны крупных
production-сервисов (не привязано к конкретному проекту, чтобы не тащить в этот репозиторий артефакты
других кодовых баз): единый способ логирования, отсутствие утечки traceback наружу,
health/readiness-эндпоинты, конфиг через pydantic-settings, базовый dev-tooling. Тяжёлые вещи вроде
DI-контейнера, отдельного воркера очередей, Sentry/Prometheus/JSON-RPC сознательно не переносились —
для pet-проекта (FastAPI + SQLAlchemy Core + sqlite, один пользователь, локальный запуск) это было бы
переинженерингом.

Конфиг через env (тема, которая пересекается с TODO-пунктом 3 "12-factor") сделан здесь, а не отложен —
по решению пользователя. В пункте 3 останутся только оставшиеся факторы 12-factor.

## Критерии приёмки

1. Необработанное исключение в хендлере не роняет процесс и не отдаёт клиенту traceback — логируется с
   полным stacktrace на сервере, клиенту уходит generic 500 с коротким сообщением. Формат тела ответа
   для уже существующих `HTTPException` (400/404/...) не меняется — единственный клиент (`static/app.js`)
   не парсит тело ошибки, менять формат без потребителя не стали (YAGNI).
2. Есть `GET /healthcheck` (liveness, всегда 200) и `GET /ready` (readiness, 200 только если БД реально
   отвечает на запрос, иначе 503).
3. Конфигурация (путь к БД, уровень и формат логов, host/port) берётся из env-переменных через
   pydantic-settings с префиксом `TRACKER_`, есть `.env.example`, невалидный конфиг роняет старт
   приложения, а не падает в рантайме на первом запросе.
4. Логи идут в stdout; пишется access-лог и лог необработанных исключений. Формат переключаемый через
   `TRACKER_LOG_FORMAT` — `console` (по умолчанию, для локальной разработки) или `json` (продакшен).
5. `ruff check` проходит без ошибок, есть `.pre-commit-config.yaml` с ruff, есть GitHub Actions workflow
   (`ruff check` + `pytest` на push/PR).
6. Все существующие тесты остаются зелёными, monkeypatch `DB_PATH` в `tests/conftest.py` не ломается.

## Известное ограничение

`TRACKER_LOG_FORMAT` переключает формат логов самого приложения (например, `unhandled_exception_handler`).
Access-лог uvicorn (запросы method/path/status) настраивается и выводится самим uvicorn независимо —
он не переведён в JSON при `TRACKER_LOG_FORMAT=json`. Для одного локального процесса без внешнего
агрегатора логов это не является проблемой; unification потребовала бы либо кастомного access-log
middleware, либо переопределения `uvicorn`'овского `log_config`, что для pet-проекта избыточно.

## Осознанно не делаем

- Sentry/Prometheus/трейсинг — некому смотреть дашборды в личном pet-проекте.
- Иерархию доменных exception-классов и переформатирование ответов `HTTPException` — в my-tracker
  `app/api.py` уже и есть транспортный слой, разделять там нечего; единственный клиент не читает тело
  ошибки.
- CORS/security headers — локальный однопользовательский инструмент.

## Реализация

- `app/settings.py` — `Settings(BaseSettings)`, `env_prefix="TRACKER_"`
- `app/db.py` — `DB_PATH` берётся из `settings.DB_PATH`
- `app/logging_config.py` — `configure_logging(level, format)`, console/json форматтеры
- `app/errors.py` — `unhandled_exception_handler`
- `app/health.py` — `/healthcheck`, `/ready`
- `main.py` — подключение логирования/обработчика ошибок/health-роутера, host/port из settings
- `.env.example`, `pyproject.toml` (`pydantic-settings`, `ruff`), `.pre-commit-config.yaml`,
  `.github/workflows/ci.yml`
- Тесты: `tests/test_health.py`, `tests/test_unhandled_errors.py`, `tests/test_settings.py`, все
  помечены `@pytest.mark.spec("0002")`
