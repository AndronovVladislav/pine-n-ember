# 0004 — Bootstrap-структура (без DI)

**Статус:** done

**Примечание (задним числом):** ponytail-аудит (после spec 0009) отметил пять из шести
bootstrap-модулей (`api.py`, `errors.py`, `health.py`, `logging.py`, `static.py`) как
однострочные обёртки с единственным вызывающим местом — по решению пользователя они
инлайнены обратно в `build_app()`. Оставлен только `bootstrap/database.py` — там есть
реальная логика (`check_schema_is_current()`), не просто делегирование. Критерий приёмки 1
(«по одному модулю на concern») с этого момента не выполняется буквально — это осознанный
откат части паттерна, а не отмена задачи целиком: `main.py` по-прежнему тонкий,
`build_app()` по-прежнему единая точка сборки приложения.

## Контекст

Продолжение переноса применимых паттернов из production-практики (после стиля — `specs/0003`; источник
конкретно не называется — my-tracker личный проект, не должен быть артефактно связан с чужими кодовыми
базами). Сейчас вся инициализация приложения (логирование, alembic upgrade + сид БД, регистрация
exception handler'а, подключение роутеров, mount статики, uvicorn entrypoint) свалена в один `main.py`.

Паттерн-образец: инициализация разложена по `app/bootstrap/*.py` — один файл на concern, функция
`bootstrap_*()` на каждый, вызываются последовательно из `app/bootstrap/__init__.py::run()`. В образце
`bootstrap_*()` ещё и регистрирует зависимости в DI-контейнере — после обсуждения решили
**DI-контейнер не делаем**: ни одного реального места, где он был бы нужен прямо сейчас (проверенный
YAGNI-кейс, а не "вдруг понадобится"). Берём только сам паттерн разбивки на именованные
bootstrap-функции по одной на concern, без контейнера — `bootstrap_*(app)` мутирует переданный
`FastAPI`-инстанс напрямую.

Объём — по решению пользователя: переносим **всю** текущую инициализацию, `main.py` становится тонким.

## Критерии приёмки

1. `app/bootstrap/` — по одному модулю на concern: логирование, миграции+сид БД, error handler,
   API-роутер, health-роутер, статика. Каждый — независимо вызываемая функция.
2. `app/bootstrap/__init__.py::build_app() -> FastAPI` — собирает полностью сконфигурированное
   приложение, вызывая bootstrap-функции в фиксированном порядке.
3. `main.py` не содержит инициализационной логики — только `app = build_app()` и
   `if __name__ == "__main__": uvicorn.run(...)`.
4. Поведение не меняется: миграции и сид всё ещё выполняются на ASGI lifespan-старте (а не при импорте
   модуля) — критично для тестовой изоляции (`tests/conftest.py` monkeypatch'ит `DB_PATH` до реального
   старта приложения через `TestClient`, а не до импорта `main`).
5. Все существующие тесты проходят без изменения своей бизнес-логики — меняется только путь
   monkeypatch'а `command.upgrade` (переезжает вместе с alembic-импортом).
6. Без DI-контейнера — bootstrap-функции принимают `app: FastAPI` явным параметром, ничего никуда не
   "регистрируется".

## Осознанно не делаем

- DI-контейнер (`kink` или свой) — нет ни одного текущего потребителя, добавлять "про запас" отдельным
  решением отклонили как нарушение YAGNI.

## Реализация

- `app/bootstrap/logging.py` — `bootstrap_logging()`
- `app/bootstrap/database.py` — `bootstrap_database()` (alembic upgrade + seed_defaults)
- `app/bootstrap/errors.py` — `bootstrap_errors(app)`
- `app/bootstrap/api.py` — `bootstrap_api(app)`
- `app/bootstrap/health.py` — `bootstrap_health(app)`
- `app/bootstrap/static.py` — `bootstrap_static(app)`
- `app/bootstrap/__init__.py` — `lifespan` (вызывает `bootstrap_database()` на старте) + `build_app()`
- `main.py` — `app = build_app()` + uvicorn entrypoint
- `tests/conftest.py` — monkeypatch-путь для `command.upgrade` меняется на
  `app.bootstrap.database.command.upgrade`

## Тест (TDD, помечен `@pytest.mark.spec("0004")`)

`tests/test_bootstrap.py` — `build_app()` возвращает `FastAPI`-приложение с зарегистрированными путями
`/healthcheck`, `/ready`, `/api/board` (проверка через `app.openapi()['paths']` — версионно-независимый
способ, `app.routes` в текущей версии FastAPI оборачивает включённые роутеры без прямого `.path`) —
прямая проверка, что `build_app()` собирает всё приложение целиком, а не часть.
