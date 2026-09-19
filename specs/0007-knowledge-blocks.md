# 0007 — Блоки → Темы → Понятия в «Базе знаний»

**Статус:** done

**Примечание:** при выполнении задачи обнаружился и был устранён несвязанный инцидент — после
переименования проекта в предыдущей задаче реальные данные пользователя оказались в
volume `my-tracker_pgdata`, а работающее приложение указывало на новый пустой
`pine-ember_pgdata`. `docker-compose.yml` переключён на старый volume (`pgdata: external: true,
name: my-tracker_pgdata`), задача TRACKER-2 (заведённая в промежуточном пустом состоянии) перенесена
в восстановленную БД вручную, пустой volume удалён. Также удалён отслуживший своё
`scripts/migrate_sqlite_to_postgres.py` (см. примечание в spec 0006) — новую схему (`topics`/
`concepts`) он всё равно не поддерживал.

## Контекст

Задача TRACKER-2 (взята из таблицы `tasks` собственной БД приложения). «База знаний» сейчас
смоделирована как плоский список «скиллов» (`entities`, `kind='skill'`) с вложенными «командами»
(`entity_items`, `kind='command'`). Нужно:

1. Переименовать понятия: скилл → тема, команда → понятие.
2. Добавить новый уровень группировки — блок (например, блок «Backend» содержит темы «API»,
   «Rate limiting»; внутри темы «API» — понятия Definition/Types/Example).
3. Старые «скиллы» становятся обычными темами без блока.

Решения, принятые с пользователем:
- Тема принадлежит ровно одному блоку или ни одному (nullable FK), не many-to-many.
- Поле `kind` (сейчас всегда одно и то же значение в каждой таблице, реально не варьируется) —
  убрано полностью, а не переименовано в 'topic'/'concept'.
- Реальные данные пользователя (тема «Разобрать WAL для fns-cs» и её понятие) — не трогаем, текст
  остаётся как есть.
- Управление блоками — полный CRUD (создать/переименовать/удалить блок, переносить тему между
  блоками), не минимальный вариант.
- Переименовано везде в коде: `entities`→`topics`, `entity_items`→`concepts`, `/api/entities`→
  `/api/topics`, `entity_id`→`topic_id`, все Python/JS идентификаторы и функции — не только текст в
  UI.

## Критерии приёмки

1. Новая таблица `blocks` (`id`, `name`, `position`).
2. `entities` переименована в `topics`, `entity_items` — в `concepts`, `entity_id` в `concepts` —
   в `topic_id`. Колонка `kind` удалена из обеих таблиц. В `topics` добавлена нового `block_id`
   (nullable, FK → `blocks.id`, `ondelete='SET NULL'`).
3. `GET /api/knowledge` возвращает `{"blocks": [{id, name, position, topics: [Topic]}], "topics":
   [Topic]}`, где второй список — темы без блока. `Topic = {id, block_id, name, description,
   metadata, concepts: [Concept]}`, `Concept = {id, topic_id, name, description, metadata}`.
4. CRUD блоков: `POST /api/blocks`, `PATCH /api/blocks/{id}`, `DELETE /api/blocks/{id}` (204;
   удаление блока не удаляет темы — их `block_id` становится `NULL`).
5. CRUD тем: `POST /api/topics` (с опциональным `block_id`), `PATCH /api/topics/{id}` (можно менять
   `block_id`, включая явный `null` для разгруппировки), `DELETE /api/topics/{id}` (204, каскадно
   удаляет понятия).
6. CRUD понятий: `POST /api/topics/{id}/concepts`, `PATCH /api/concepts/{id}`,
   `DELETE /api/concepts/{id}` (204).
7. UI: кнопка «Новая тема» вместо «Новый скилл», «+ понятие» вместо «+ команда», кнопка «+ блок»;
   тема создаётся/редактируется с выбором блока (или «без блока»); блоки рендерятся как секции с
   вложенными темами, темы без блока — в отдельной секции; у блока есть переименование и удаление.
8. Старая тема пользователя («Разобрать WAL для fns-cs») продолжает работать без блока после
   миграции — её текст не менялся.

## Осознанно не делаем

- Не делаем many-to-many темы↔блоки — по решению пользователя, ровно один блок или ни одного.
- Не трогаем текст существующей темы «Разобрать WAL для fns-cs» и её понятия — реальные данные
  пользователя.
- Не добавляем drag-n-drop для переноса темы между блоками — только через модалку/select.

## Реализация

- `app/tables.py` — таблица `blocks`, переименование `entities`→`topics`, `entity_items`→`concepts`,
  `entity_id`→`topic_id`, удаление `kind`, добавление `block_id`
- `alembic/versions/0002_topics_blocks_concepts.py` — миграция (create_table blocks → rename_table x2
  → alter_column entity_id→topic_id → add_column block_id → drop_column kind x2)
- `app/schemas.py` — `BlockOut/BlockCreate/BlockUpdate`, `TopicOut/TopicCreate/TopicUpdate`,
  `ConceptOut/ConceptCreate/ConceptUpdate` (замена Entity*/EntityItem*)
- `app/logic.py` — `topic_row_to_dict`, `concept_row_to_dict`, `block_row_to_dict`
- `app/api.py` — эндпоинты `/blocks`, `/topics`, `/topics/{id}/concepts`, `/concepts/{id}`,
  `get_knowledge()` собирает блоки с вложенными темами + темы без блока
- `static/index.html`, `static/app.js`, `static/style.css` — UI блоков/тем/понятий

## Тесты (TDD, `@pytest.mark.spec("0007")`)

`tests/test_knowledge_api.py` — полностью переписан:
- создание блока, темы (с блоком и без), понятия — полная проверка строки в БД
- `GET /api/knowledge` — темы сгруппированы по блокам корректно, темы без блока отдельно
- перенос темы между блоками через `PATCH /api/topics/{id}` (`block_id`) и разгруппировка
  (`block_id: null`)
- удаление блока не удаляет темы, а обнуляет их `block_id`
- удаление темы каскадно удаляет её понятия

**Примечание (задним числом):** колонка `metadata` в `topics`/`concepts` (унаследована от старых
`entities`/`entity_items`) удалена отдельной миграцией `0003` по итогам ponytail-аудита — ни один
эндпоинт её не читал и не писал, везде оставался дефолт `'{}'`.
