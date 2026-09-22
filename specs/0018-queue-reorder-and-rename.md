# 0018 — Drag'n'drop и переименование очередей

**Статус:** draft

## Контекст

TRACKER-11 (из БД приложения) — часть исходного пункта TODO. Второй пункт этого тикета («несколько
мокапов для селектора очереди») — визуальные референсы, генерируются отдельно вне кода и тестов, в
этот spec/PR не входит.

Сейчас переключатель очередей (`#queue-switcher`, `renderQueueSwitcher()`, `static/app.js:128-140`)
рисует очереди в порядке, в котором их вернул `SELECT` без `ORDER BY` (`list_board()`,
`app/domains/board/repository.py`) — то есть фактически недетерминированно, полагается на порядок
вставки в БД, который ничем не гарантирован. Переименовать очередь нельзя вообще — только менять
`label` на лету через поле «Очередь» у задачи, но это создаёт новую очередь, а не переименовывает
старую.

Статусы уже прошли через аналогичную доработку (specs/0013-board-small-improvements.md):
`Status.position` + `PUT /statuses/reorder` + инлайн-переименование колонки. Очереди делаем по тому
же паттерну.

## Критерии приёмки

1. У `Queue` — новое поле `position: int`, определяет порядок отображения вкладок. `GET /api/board`
   возвращает очереди, отсортированные по `position` (сейчас — недетерминированный порядок).
2. Новая очередь, созданная «на лету» (через поле «Очередь» у задачи, как и сейчас), получает
   `position` = максимальный существующий + 1 (в конец списка вкладок).
3. `PUT /api/queues/reorder` — новый роут, принимает `{"keys": [...]}`, список всех ключей очередей
   в новом порядке, аналогично `PUT /api/statuses/reorder`. 400 (`InvalidOperation`), если набор
   ключей не совпадает с текущими очередями.
4. Вкладки очередей (`#queue-switcher`) можно перетаскивать (drag'n'drop) для смены порядка — тот же
   UX, что уже есть у колонок статусов (`.column-head[draggable]`/`onColumnDragStart` и т.д.), только
   применительно к `.range-btn` внутри `#queue-switcher`.
5. `PATCH /api/queues/{queue_key}` — новый роут, переименовывает очередь (обновляет `label`, `key` не
   меняется — на него ссылаются задачи по `queue_key`). 404 (`NotFound`), если очереди с таким `key`
   нет. Пустой/пробельный `label` — 400 (`InvalidOperation`). Дубликат `label` (без учёта регистра) —
   400, по аналогии с `rename_status`.
6. На вкладке очереди — двойной клик (не одиночный, т.к. одиночный клик уже переключает активную
   очередь) открывает инлайн-редактирование названия вкладки, аналогично `startRenameStatus`. `Enter`/
   потеря фокуса сохраняет, `Escape` отменяет без запроса.
7. Существующий HTTP-контракт (board/knowledge/finance, весь набор из 76 тестов) не ломается, кроме
   двух новых роутов из п.3/5 и добавленного поля `position` у `QueueOut`.

## Осознанно не делаем

- Drag'n'drop очередей между собой с одновременным изменением состава задач — переупорядочивание
  меняет только визуальный порядок вкладок, задачи между очередями не перемещает (это уже делается
  через поле «Очередь» у задачи, вне рамок этого тикета).
- Единый переиспользуемый DnD-хелпер для колонок статусов и вкладок очередей — код колонок и вкладок
  сейчас не переиспользует общих функций (`onColumnDrag*` завязан на `.column`/`STATUSES`), рефакторинг
  в общий модуль — отдельная задача, не часть этого тикета (см. «Surgical changes» в CLAUDE.md — не
  трогаем то, что не просят).
- CRUD-удаление очереди через UI (создание — по-прежнему только «на лету», удаления вообще нет ни для
  очередей, ни для статусов, кроме `delete_status`) — не запрошено ни в TODO, ни в груминге.

## Реализация

- Миграция `alembic/versions/0008_queue_position.py`: `ALTER TABLE queues ADD COLUMN position INTEGER
  NOT NULL DEFAULT 0`, затем `UPDATE queues SET position = sub.rn FROM (SELECT key, ROW_NUMBER() OVER
  (ORDER BY key) - 1 AS rn FROM queues) sub WHERE queues.key = sub.key` — существующим очередям
  проставляется детерминированный порядок (по `key`, раз исходного порядка вставки в данных нет).
- `app/domains/board/models/queue.py`: `position: Mapped[int] = mapped_column(server_default='0')`.
- `app/domains/board/dto.py`: `Queue.position: int`.
- `app/domains/board/repository.py`:
  - `list_board()` — `select(models.Queue).order_by(models.Queue.position)`.
  - `_resolve_queue()` — при создании новой очереди вычисляет `max(position) + 1`, аналогично
    `_resolve_status`.
  - Новые методы `reorder_queues(keys: list[str])` и `rename_queue(queue_key: str, label: str)` —
    копируют структуру `reorder_statuses`/`rename_status` один в один, только для таблицы `queues`.
- `app/domains/board/ports.py`: добавить оба метода в протокол `BoardRepository`.
- `app/schemas.py`: `QueueOut.position: int`, новая схема `QueueRename(label: str)` (по образцу
  `StatusRename`), переиспользовать `StatusReorder` под именем `QueueReorder` не будем — своя схема
  с тем же полем `keys: list[str]`, чтобы не путать в OpenAPI-схеме сущности местами.
- `app/api/board.py`: `PUT /queues/reorder`, `PATCH /queues/{queue_key}` — по образцу существующих
  роутов для статусов, `@handle_domain_errors`.
- `static/app.js`:
  - `renderQueueSwitcher()` — добавить `draggable="true"`, `data-queue="${q.key}"`,
    `ondblclick="startRenameQueue(this, '${q.key}')"` на каждую `.range-btn`; навесить
    `dragstart`/`dragend`/`dragover`/`dragleave`/`drop` листенеры на сам `#queue-switcher` (делегирование
    через `data-queue` на вкладках, а не на колонках).
  - `onQueueDragStart`/`onQueueDragEnd`/`onQueueDragOver`/`onQueueDragLeave`/`onQueueDrop` — копируют
    структуру `onColumnDrag*`, оперируют `QUEUES` и `PUT /queues/reorder` вместо `STATUSES`/
    `/statuses/reorder`.
  - `startRenameQueue(labelEl, queueKey)` — копирует структуру `startRenameStatus`, `PATCH
    /queues/{queueKey}`.
- `static/style.css`: `.range-btn` получает `cursor: grab`/`.dragging`/`.drag-over` состояния, если их
  ещё нет под этим классом (сверяется по факту существующих стилей `.column`/`.column-head` при
  реализации).

## Тесты

`tests/api/test_board.py` — новые сценарии: очереди в `GET /board` идут в порядке `position`; новая
очередь «на лету» получает следующий `position`; `PUT /queues/reorder` меняет порядок, 400 при
несовпадении набора ключей; `PATCH /queues/{key}` переименовывает, 404 на несуществующий ключ, 400 на
пустой/дублирующийся `label`.
