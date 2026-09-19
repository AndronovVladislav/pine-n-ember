# 0011 — Закрытые домены (`app/domains`), декларативные `models`, общий репозиторный интерфейс

**Статус:** done

**Примечание:** `StrId` (переиспользуемый тип для FK-колонок) убран после ревью — физически он ничем
не отличался от обычного `Mapped[str]` (везде использовался вместе с явным `mapped_column(ForeignKey(...))`,
который и так перекрывает собственный `mapped_column()` из `Annotated`), а название вводило в
заблуждение (это не первичный ключ). Остался только `Id`. FK-колонки (`tag_key`, `status_key`,
`block_id`, `topic_id`) теперь объявлены как `Mapped[str]`/`Mapped[str | None]` напрямую.

## Контекст

TRACKER-4 (из БД приложения). Продолжение доработок после TRACKER-3 (гексагональный рефакторинг,
`specs/0010-hexagonal-architecture.md`). Пользователь оценил результат и попросил довести структуру
до более строгого package-by-feature вида:

1. Каждая таблица — свой модуль; базовый класс с автогенерацией `__tablename__`; переиспользуемые
   аннотированные типы колонок (`Id`, `StrId`). Модуль с ORM-классами называется `models`, не `tables`.
2. Общий интерфейс/базовый класс для любого репозитория — у обоих доменов одинаковый жизненный цикл
   (`__enter__`/`__exit__`/`close`), он не должен дублироваться в каждом адаптере.
3. `app/domain` → `app/domains`, два пакета по доменам (`board`, `knowledge`). **Домен — полностью
   закрытая структура**: код вне домена X обращается к X только как к пакету (`app.domains.board`),
   никогда напрямую к `app.domains.board.repository`/`.models`/`.dto`.
4. Перевод доменных исключений в `HTTPException` — декоратор на `match`/`case` (не context manager).
5. Убрать `response_model=...` из роутов, использовать аннотацию возвращаемого типа функции.
6. Структура `tests/` симметрична структуре кода там, где код превращается в пакет.

Ничего в HTTP-контракте, поведении и схеме БД не меняется — чисто структурный рефакторинг.

## Критерии приёмки

1. `app/domain/`, `app/adapters/`, `app/tables.py` удалены; их содержимое живёт в `app/domains/board/`
   и `app/domains/knowledge/`.
2. У каждой ORM-таблицы свой модуль в `app/domains/<domain>/models/<table>.py`; классы наследуются от
   общего `app.domains._base.Base`, который сам генерирует `__tablename__` из имени класса (без
   ручного `__tablename__ = '...'` в каждом классе).
3. Повторяющиеся паттерны колонок (первичный ключ, ссылка на чужой ключ) объявлены как переиспользуемые
   аннотированные типы `Id`/`StrId` в `app.domains._base`.
4. Есть общий `Repository`-протокол и `SqlAlchemyRepository`-база (`app.domains._repository`) с
   `close`/`__enter__`/`__exit__`; `SqlAlchemyBoardRepository`/`SqlAlchemyKnowledgeRepository`
   наследуют базу и не переопределяют эти три метода.
5. **Закрытость домена**: `grep -rn` по `app.domains.board.(repository|models|dto|seed)` и
   `app.domains.knowledge.(repository|models|dto)` вне пакетов `app/domains/board/`,
   `app/domains/knowledge/` и `tests/` — пусто. Прикладной код (`app/api`, `app/db.py`,
   `app/bootstrap`) импортирует из доменов только то, что реэкспортировано в их `__init__.py`.
   Исключение — `app.domains._base.Base.metadata` в `alembic/env.py` и тестах, которым нужна вся
   схема сразу, без привязки к домену.
6. `app/api.py` — пакет `app/api/` (`board.py`, `knowledge.py`, `__init__.py` собирает общий `router`);
   `from app.api import router` в `app/bootstrap/__init__.py` продолжает работать без изменений.
7. Доменные исключения переводятся в `HTTPException` декоратором `handle_domain_errors`
   (`app/errors.py`), реализованным через `match`/`case`, применяемым к роутам, а не через context
   manager.
8. Роуты не используют `response_model=...` — там, где он был, ответ типизирован через `-> Schema`
   в сигнатуре функции; `grep -rn "response_model" app/api/` — пусто.
9. HTTP-контракт (пути, коды ответов, форма JSON) не меняется — весь текущий набор тестов проходит
   без изменения ассертов, кроме одного механического переноса monkeypatch-цели в
   `tests/test_unhandled_errors.py` (репозиторий переехал вместе с `gen_id`) — та же ситуация, что уже
   была задокументирована в spec 0010.
10. `tests/test_knowledge_api.py` переезжает в `tests/api/test_knowledge.py`, мирроя `app/api/knowledge.py`.

## Осознанно не делаем

- Не переносим `tests/test_bootstrap.py`, `test_health.py`, `test_settings.py`, `test_migration_ids.py`,
  `test_migrate_sqlite_to_postgres.py` в подпапки — они мирроят модули (`app/bootstrap`, `app/health.py`,
  `app/settings.py`, `scripts/`), которые этот рефакторинг не трогает.
- Не заводим `tests/domains/` — доменная логика сегодня проверяется только через HTTP (`tests/api/`);
  отдельных unit-тестов на репозитории нет ни до, ни после — заводить их сейчас было бы расширением
  тестового покрытия, а не структурным рефакторингом.
- `StrId` физически равен `Mapped[str]` (общий `type_annotation_map`) — вводится только ради
  единообразной пометки "это строковый идентификатор", не ради другой SQL-схемы.
- Не трогаем `alembic/versions/*` — схема БД не меняется, только Python-объявление тех же таблиц.
- Не меняем HTTP-контракт, Pydantic-схемы, содержимое доменных моделей — только расположение кода и
  то, как FastAPI/декораторы им пользуются.

## Реализация

Полная целевая структура, код примеров и список затрагиваемых файлов — в плане
`/Users/tochkamac/.perry-claude/plans/inherited-percolating-sunbeam.md` (актуален на момент написания
этой спеки, см. разделы 1–7).

Кратко:
- `app/domains/_base.py` — `Base`, `Id`, `StrId`
- `app/domains/_repository.py` — `Repository` (Protocol), `SqlAlchemyRepository`
- `app/domains/errors.py`, `app/domains/ids.py` — без изменений по содержанию, переезд из
  `app/domain/errors.py`/`app/domain/ids.py`
- `app/domains/board/{dto,ports,repository,seed}.py`, `app/domains/board/models/{status,tag,task}.py`,
  `app/domains/board/__init__.py` (публичный интерфейс: `BoardRepository`, `SqlAlchemyBoardRepository`,
  `seed_defaults`)
- `app/domains/knowledge/{dto,ports,repository}.py`,
  `app/domains/knowledge/models/{block,topic,concept}.py`, `app/domains/knowledge/__init__.py`
  (публичный интерфейс: `KnowledgeRepository`, `SqlAlchemyKnowledgeRepository`)
- `app/api/{__init__,board,knowledge}.py`
- `app/errors.py` — добавить `handle_domain_errors`
- `app/db.py` — только `get_engine`/`get_connection`
- `app/bootstrap/database.py`, `alembic/env.py` — обновить импорты
- `tests/conftest.py`, `tests/test_schema_check.py`, `tests/test_unhandled_errors.py` — обновить
  импорты (механически, без изменения ассертов)
- `tests/test_knowledge_api.py` → `tests/api/test_knowledge.py`
- `ARCHITECTURE.md` — обновить "Текущее состояние"

## Тесты

Поведение не меняется — чистый рефакторинг. Существующий набор — регрессионный тест "снаружи",
должен пройти без изменения ассертов (кроме одного disclosed-изменения в `test_unhandled_errors.py`,
см. критерий приёмки 9, и физического переноса файла в критерии 10). Новых тестов под сам рефакторинг
не пишем — новой бизнес-логики нет.
