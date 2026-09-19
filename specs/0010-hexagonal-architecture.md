# 0010 — Backend на гексагональную архитектуру

**Статус:** done

**Примечание:** `tests/test_unhandled_errors.py` монkeypatch'ил `app.api.gen_id`, чтобы искусственно
вызвать необработанное исключение — точка внедрения ошибки неизбежно переехала вместе с генерацией id
из `app.api` в `app.adapters.knowledge_repository`. Сам сценарий и все ассерты теста не менялись,
изменилась только цель `monkeypatch.setattr`.

## Контекст

TRACKER-3: «Перевести backend на hexagonal архитектуру». `ARCHITECTURE.md` заранее описывал это как
отложенный технический долг (`app/logic.py`/`app/api.py` напрямую работают с `sqlalchemy.Connection`)
и договаривался не трогать его без отдельного осознанного пункта — этот пункт появился.

Бизнес-логика (`app/api.py`) перестаёт напрямую зависеть от SQLAlchemy — зависит только от портов
(интерфейсов), которые сама определяет. Реализация на Postgres становится подставляемым адаптером.

Гранулярность (согласовано): 2 крупных порта — `BoardRepository` (tasks/statuses/tags) и
`KnowledgeRepository` (blocks/topics/concepts), не 6 по агрегатам.

## Критерии приёмки

1. `app/domain/` (models.py, ports.py, errors.py, ids.py) не импортирует ничего из SQLAlchemy/FastAPI.
2. `app/adapters/` (board_repository.py, knowledge_repository.py) реализует порты из `app/domain/ports.py`
   на SQLAlchemy Core + `app/tables.py`.
3. `app/api.py` не импортирует SQLAlchemy напрямую — только через `app.domain.ports`/`app.adapters`.
4. Доменные исключения (`NotFound`, `InvalidOperation`) не зависят от FastAPI; `app/api.py` —
   единственное место, переводящее их в `HTTPException`.
5. HTTP-контракт (пути, коды ответов, форма JSON) не меняется — весь существующий набор тестов
   проходит без изменения самих тестов.
6. `app/logic.py` удалён — код расползается по `domain/ids.py` и `adapters/*.py`.

## Осознанно не делаем

- DI-контейнер — репозитории создаются напрямую в роутах (как решили в spec 0004).
- 6 мелких портов по агрегатам — только 2 крупных, по доменам.
- Отдельный "use case"/application-слой поверх портов — роуты `api.py` и есть application-слой.
- Изменение HTTP API — это внутренний рефакторинг, контракт не меняется.

## Реализация

- `app/domain/models.py` — dataclasses: Task, Status, Tag, Block, Topic, Concept, BlockWithTopics, KnowledgeView
- `app/domain/errors.py` — `NotFound`, `InvalidOperation`
- `app/domain/ids.py` — `gen_id`, `slug`, `next_color`, `COLOR_PALETTE` (перенос как есть)
- `app/domain/ports.py` — `BoardRepository`, `KnowledgeRepository` (`typing.Protocol`)
- `app/adapters/board_repository.py` — `SqlAlchemyBoardRepository`
- `app/adapters/knowledge_repository.py` — `SqlAlchemyKnowledgeRepository` (включая `reposition_in_parent`
  как приватную деталь адаптера)
- `app/schemas.py` — `model_config = ConfigDict(from_attributes=True)` на всех `*Out`-схемах
- `app/api.py` — переписан на вызовы репозиториев + перевод доменных исключений в `HTTPException`
- `app/logic.py` — удалён

## Тесты

Поведение не меняется — это чистый рефакторинг. Существующий набор (`tests/test_knowledge_api.py` и
остальные, все бьют через `TestClient`/HTTP) — регрессионный тест "снаружи", должен пройти без
изменения ассертов. Новых тестов под сам рефакторинг не пишем — новой бизнес-логики нет.
