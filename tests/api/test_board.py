import pytest
from sqlalchemy import select

from app.domains.board import models as board_models


def status_row_as_dict(conn, status_key):
    row = conn.execute(select(board_models.Status).where(board_models.Status.key == status_key)).one()
    return {k: v for k, v in row._mapping.items() if k != 'key'}


def task_row_as_dict(conn, task_id):
    row = conn.execute(select(board_models.Task).where(board_models.Task.id == task_id)).one()
    return {k: v for k, v in row._mapping.items() if k != 'id'}


def seed_status(client, label='Черновик'):
    """Статусы создаются только неявно - через задачу с этим статусом (отдельного POST /api/statuses нет)."""
    task = client.post('/api/tasks', json={'title': 'seed', 'queue': 'seed-queue', 'status': label}).json()
    return task['status']


@pytest.mark.spec('0013')
class TestRenameStatus:
    def test_row_is_updated_fully(self, client, db_connection):
        """
        Тест проверяет переименование статуса через PATCH /api/statuses/{key}.

        Ожидание: label статуса меняется, key/color/position не затрагиваются
        """
        status_key = seed_status(client)
        before = status_row_as_dict(db_connection, status_key)

        response = client.patch(f'/api/statuses/{status_key}', json={'label': 'В процессе'})
        assert response.status_code == 200

        assert status_row_as_dict(db_connection, status_key) == {**before, 'label': 'В процессе'}

    def test_tasks_keep_their_status_key(self, client, db_connection):
        """
        Тест проверяет, что переименование статуса не рвёт связь с задачами внутри него — они
        ссылаются на status_key, а не на label.

        Ожидание: у задачи после переименования её статуса status в ответе API не меняется
        """
        status_key = seed_status(client)
        task = client.post('/api/tasks', json={'title': 'Разобрать WAL', 'queue': 'work', 'status': status_key}).json()

        client.patch(f'/api/statuses/{status_key}', json={'label': 'В процессе'})

        response = client.get('/api/board').json()
        updated_task = next(t for t in response['tasks'] if t['id'] == task['id'])
        assert updated_task == {**task, 'status': status_key}

    def test_missing_status_returns_404(self, client):
        """
        Тест проверяет переименование несуществующего статуса.

        Ожидание: 404, домен бросает NotFound
        """
        response = client.patch('/api/statuses/no-such-status', json={'label': 'Новое имя'})
        assert response.status_code == 404

    def test_blank_label_returns_400(self, client):
        """
        Тест проверяет переименование статуса в пустую/пробельную строку.

        Ожидание: 400, домен бросает InvalidOperation - статус не может остаться без имени
        """
        status_key = seed_status(client)

        response = client.patch(f'/api/statuses/{status_key}', json={'label': '   '})
        assert response.status_code == 400

    def test_duplicate_label_returns_400(self, client):
        """
        Тест проверяет переименование статуса в label другого уже существующего статуса.

        Ожидание: 400, домен бросает InvalidOperation - _resolve_status ищет статус по label
        без учёта порядка, дубликат сделал бы выбор статуса при создании/правке задачи
        недетерминированным
        """
        first_key = seed_status(client, 'To Do')
        second_key = seed_status(client, 'In Progress')

        response = client.patch(f'/api/statuses/{second_key}', json={'label': 'To Do'})
        assert response.status_code == 400
        assert first_key != second_key


@pytest.mark.spec('0014')
class TestCreateTask:
    def test_gets_queue_and_no_due_field(self, client, db_connection):
        """
        Тест проверяет создание задачи через POST /api/tasks с указанием очереди.

        Ожидание: в БД записывается queue_key (аналог бывшего tag_key), поля due больше не
        существует ни в модели, ни в ответе API
        """
        response = client.post('/api/tasks', json={'title': 'Разобрать WAL', 'queue': 'work'})
        assert response.status_code == 200
        body = response.json()
        assert 'due' not in body

        assert task_row_as_dict(db_connection, body['id']) == {
            'number': body['number'],
            'title': 'Разобрать WAL',
            'queue_key': 'work',
            'status_key': body['status'],
            'description': '',
            'position': 0,
            'priority': 'low',
        }

    def test_gets_sequential_number(self, client, db_connection):
        """
        Тест проверяет, что каждая новая задача получает свой ключ-номер, назначенный БД.

        Ожидание: номера уникальны и монотонно растут у подряд созданных задач, остальные поля
        каждой из них записаны корректно
        """
        first = client.post('/api/tasks', json={'title': 'Первая', 'queue': 'work'}).json()
        second = client.post('/api/tasks', json={'title': 'Вторая', 'queue': 'work'}).json()

        assert task_row_as_dict(db_connection, first['id']) == {
            'number': first['number'],
            'title': 'Первая',
            'queue_key': 'work',
            'status_key': first['status'],
            'description': '',
            'position': 0,
            'priority': 'low',
        }
        assert task_row_as_dict(db_connection, second['id']) == {
            'number': second['number'],
            'title': 'Вторая',
            'queue_key': 'work',
            'status_key': second['status'],
            'description': '',
            'position': 1,
            'priority': 'low',
        }
        assert isinstance(first['number'], int)
        assert second['number'] > first['number']

    def test_client_supplied_number_is_ignored(self, client, db_connection):
        """
        Тест проверяет, что number нельзя подделать через тело запроса — это ключ, назначаемый
        исключительно БД при вставке.

        Ожидание: переданный клиентом number не влияет на фактически присвоенный номер, остальные
        поля задачи записаны так, будто number вообще не передавали
        """
        response = client.post('/api/tasks', json={'title': 'Задача', 'queue': 'work', 'number': 999999})
        assert response.status_code == 200
        body = response.json()

        assert task_row_as_dict(db_connection, body['id']) == {
            'number': body['number'],
            'title': 'Задача',
            'queue_key': 'work',
            'status_key': body['status'],
            'description': '',
            'position': 0,
            'priority': 'low',
        }
        assert body['number'] != 999999

    def test_missing_queue_returns_400(self, client):
        """
        Тест проверяет создание задачи без указания очереди.

        Ожидание: 400 - очередь обязательна, иначе задача была бы невидима ни в одном из
        фильтров доски (доска всегда показывает ровно одну очередь, см. specs/0015)
        """
        response = client.post('/api/tasks', json={'title': 'Задача без очереди'})
        assert response.status_code == 400

    def test_blank_queue_returns_400(self, client):
        """
        Тест проверяет создание задачи с пустой/пробельной строкой в качестве очереди.

        Ожидание: 400, аналогично отсутствию поля queue вовсе
        """
        response = client.post('/api/tasks', json={'title': 'Задача', 'queue': '   '})
        assert response.status_code == 400


@pytest.mark.spec('0014')
class TestUpdateTask:
    def test_number_cannot_be_changed(self, client, db_connection):
        """
        Тест проверяет, что PATCH /api/tasks/{id} не позволяет поменять number задачи.

        Ожидание: number после правки остаётся тем же, что был при создании, остальные поля
        обновляются как обычно
        """
        task = client.post('/api/tasks', json={'title': 'Задача', 'queue': 'work'}).json()

        response = client.patch(f'/api/tasks/{task["id"]}', json={'title': 'Другое название', 'number': 1})
        assert response.status_code == 200

        assert task_row_as_dict(db_connection, task['id']) == {
            'number': task['number'],
            'title': 'Другое название',
            'queue_key': 'work',
            'status_key': task['status'],
            'description': '',
            'position': 0,
            'priority': 'low',
        }

    def test_queue_cannot_be_unset(self, client):
        """
        Тест проверяет, что у существующей задачи нельзя снять очередь через PATCH.

        Ожидание: 400 и при queue=null, и при queue="" - задача без очереди не должна быть
        достижимым состоянием (см. specs/0015)
        """
        task = client.post('/api/tasks', json={'title': 'Задача', 'queue': 'work'}).json()

        assert client.patch(f'/api/tasks/{task["id"]}', json={'queue': None}).status_code == 400
        assert client.patch(f'/api/tasks/{task["id"]}', json={'queue': '   '}).status_code == 400


@pytest.mark.spec('0017')
class TestTaskPriority:
    def test_defaults_to_low_when_not_passed(self, client, db_connection):
        """
        Тест проверяет создание задачи без явного приоритета.

        Ожидание: приоритет записывается как 'low' - значение по умолчанию, остальные поля
        записаны как обычно
        """
        response = client.post('/api/tasks', json={'title': 'Задача', 'queue': 'work'})
        assert response.status_code == 200
        body = response.json()
        assert body['priority'] == 'low'

        assert task_row_as_dict(db_connection, body['id']) == {
            'number': body['number'],
            'title': 'Задача',
            'queue_key': 'work',
            'status_key': body['status'],
            'description': '',
            'position': 0,
            'priority': 'low',
        }

    def test_gets_priority_passed_on_create(self, client, db_connection):
        """
        Тест проверяет создание задачи с явно переданным приоритетом.

        Ожидание: в БД и в ответе API записан ровно переданный приоритет, остальные поля - как обычно
        """
        response = client.post('/api/tasks', json={'title': 'Задача', 'queue': 'work', 'priority': 'critical'})
        assert response.status_code == 200
        body = response.json()
        assert body['priority'] == 'critical'

        assert task_row_as_dict(db_connection, body['id']) == {
            'number': body['number'],
            'title': 'Задача',
            'queue_key': 'work',
            'status_key': body['status'],
            'description': '',
            'position': 0,
            'priority': 'critical',
        }

    def test_patch_changes_priority(self, client, db_connection):
        """
        Тест проверяет изменение приоритета через PATCH /api/tasks/{id}.

        Ожидание: приоритет меняется на переданный, остальные поля не затронуты
        """
        task = client.post('/api/tasks', json={'title': 'Задача', 'queue': 'work'}).json()

        response = client.patch(f'/api/tasks/{task["id"]}', json={'priority': 'high'})
        assert response.status_code == 200
        assert response.json()['priority'] == 'high'

        assert task_row_as_dict(db_connection, task['id']) == {
            'number': task['number'],
            'title': 'Задача',
            'queue_key': 'work',
            'status_key': task['status'],
            'description': '',
            'position': 0,
            'priority': 'high',
        }

    def test_patch_without_priority_keeps_previous_value(self, client, db_connection):
        """
        Тест проверяет PATCH без поля priority в теле запроса.

        Ожидание: приоритет задачи не меняется, если поле не передано вовсе
        """
        task = client.post('/api/tasks', json={'title': 'Задача', 'queue': 'work', 'priority': 'high'}).json()

        response = client.patch(f'/api/tasks/{task["id"]}', json={'title': 'Другое название'})
        assert response.status_code == 200
        assert response.json()['priority'] == 'high'

        assert task_row_as_dict(db_connection, task['id'])['priority'] == 'high'

    def test_invalid_priority_returns_422(self, client):
        """
        Тест проверяет создание задачи с приоритетом вне закрытого списка значений.

        Ожидание: 422 - Pydantic отклоняет значение, не входящее в Literal
        """
        response = client.post('/api/tasks', json={'title': 'Задача', 'queue': 'work', 'priority': 'urgent'})
        assert response.status_code == 422
