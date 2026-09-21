import pytest
from sqlalchemy import select

from app.domains.board import models as board_models


def status_row_as_dict(conn, status_key):
    row = conn.execute(select(board_models.Status).where(board_models.Status.key == status_key)).one()
    return {k: v for k, v in row._mapping.items() if k != 'key'}


def seed_status(client, label='Черновик'):
    """Статусы создаются только неявно - через задачу с этим статусом (отдельного POST /api/statuses нет)."""
    task = client.post('/api/tasks', json={'title': 'seed', 'status': label}).json()
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
        task = client.post('/api/tasks', json={'title': 'Разобрать WAL', 'status': status_key}).json()

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
