from sqlalchemy import func, select

from app.tables import entities, entity_items


def entity_row_as_dict(conn, entity_id):
    row = conn.execute(select(entities).where(entities.c.id == entity_id)).one()
    return {k: v for k, v in row._mapping.items() if k != 'id'}


def item_row_as_dict(conn, item_id):
    row = conn.execute(select(entity_items).where(entity_items.c.id == item_id)).one()
    return {k: v for k, v in row._mapping.items() if k != 'id'}


class TestCreateEntity:
    def test_default_kind_is_skill_and_row_is_persisted_fully(self, client, db_connection):
        """
        Тест проверяет создание карточки (сущности) через POST /api/entities без явного kind.

        Ожидание: в базе появится ровно одна запись в entities с kind='skill' (значение по
        умолчанию для базы знаний), позицией 0 и пустой metadata='{}', остальные поля - как
        переданы в запросе. Сравниваем полную строку из БД, а не отдельные поля.
        """
        response = client.post('/api/entities', json={'name': 'git-helper', 'description': 'гит-скилл'})
        assert response.status_code == 200
        body = response.json()

        assert entity_row_as_dict(db_connection, body['id']) == {
            'kind': 'skill',
            'name': 'git-helper',
            'description': 'гит-скилл',
            'position': 0,
            'metadata': '{}',
        }

    def test_second_entity_gets_next_position(self, client, db_connection):
        """
        Тест проверяет, что позиция новой карточки считается как max(position) + 1 среди
        существующих карточек, аналогично тому как это уже сделано для задач в tasks.

        Ожидание: первая карточка получит position=0, вторая - position=1
        """
        first = client.post('/api/entities', json={'name': 'first'}).json()
        second = client.post('/api/entities', json={'name': 'second'}).json()

        assert entity_row_as_dict(db_connection, first['id'])['position'] == 0
        assert entity_row_as_dict(db_connection, second['id'])['position'] == 1


class TestCreateItem:
    def test_default_kind_is_command_and_row_is_persisted_fully(self, client, db_connection):
        """
        Тест проверяет создание элемента (команды) внутри карточки через
        POST /api/entities/{id}/items без явного kind.

        Ожидание: в entity_items появится запись с kind='command', привязанная к entity_id
        родительской карточки, position=0, metadata='{}' - сравниваем полную строку из БД
        """
        entity = client.post('/api/entities', json={'name': 'git-helper'}).json()

        response = client.post(
            f'/api/entities/{entity["id"]}/items',
            json={'name': '/commit', 'description': 'оформить коммит по конвенции'},
        )
        assert response.status_code == 200
        body = response.json()

        assert item_row_as_dict(db_connection, body['id']) == {
            'entity_id': entity['id'],
            'kind': 'command',
            'name': '/commit',
            'description': 'оформить коммит по конвенции',
            'position': 0,
            'metadata': '{}',
        }

    def test_missing_entity__returns_404(self, client):
        """
        Тест проверяет обращение с добавлением команды к несуществующей карточке скилла

        Ожидание: сервер вернёт 404, запись в entity_items не создастся
        """
        response = client.post('/api/entities/does-not-exist/items', json={'name': '/foo'})
        assert response.status_code == 404


class TestGetKnowledge:
    def test_returns_entities_with_nested_items_in_position_order(self, client):
        """
        Тест проверяет агрегирующий эндпоинт GET /api/knowledge, который отдаёт карточки
        вместе с вложенными в них командами для рендера вкладки "База знаний".

        Ожидание: ответ содержит одну карточку с двумя командами, в порядке их position
        """
        entity = client.post('/api/entities', json={'name': 'git-helper', 'description': 'd'}).json()
        client.post(f'/api/entities/{entity["id"]}/items', json={'name': '/commit', 'description': 'd1'})
        client.post(f'/api/entities/{entity["id"]}/items', json={'name': '/push', 'description': 'd2'})

        response = client.get('/api/knowledge')
        assert response.status_code == 200
        entities = response.json()['entities']

        assert len(entities) == 1
        assert entities[0]['id'] == entity['id']
        assert [item['name'] for item in entities[0]['items']] == ['/commit', '/push']

    def test_filters_by_kind_query_param(self, client):
        """
        Тест проверяет, что GET /api/knowledge?kind=... фильтрует карточки по типу, чтобы
        в будущем через тот же эндпоинт можно было отдавать карточки другого назначения.

        Ожидание: карточка с kind='skill' не попадает в выдачу при запросе kind='glossary'
        """
        client.post('/api/entities', json={'name': 'git-helper'})

        response = client.get('/api/knowledge', params={'kind': 'glossary'})

        assert response.json()['entities'] == []


class TestUpdateItem:
    def test_partial_update_keeps_untouched_fields(self, client, db_connection):
        """
        Тест проверяет частичное обновление команды через PATCH /api/items/{id} -
        меняем только description, name должен остаться прежним.

        Ожидание: полная строка в БД совпадёт с исходной, кроме изменённого поля description
        """
        entity = client.post('/api/entities', json={'name': 'git-helper'}).json()
        item = client.post(f'/api/entities/{entity["id"]}/items', json={'name': '/commit', 'description': 'old'}).json()

        response = client.patch(f'/api/items/{item["id"]}', json={'description': 'new'})
        assert response.status_code == 200

        assert item_row_as_dict(db_connection, item['id']) == {
            'entity_id': entity['id'],
            'kind': 'command',
            'name': '/commit',
            'description': 'new',
            'position': 0,
            'metadata': '{}',
        }


class TestDeleteEntity:
    def test_cascades_to_its_items(self, client, db_connection):
        """
        Тест проверяет, что удаление карточки скилла удаляет и все её команды через
        ON DELETE CASCADE на entity_items.entity_id, без ручной очистки в коде хендлера.

        Ожидание: после DELETE /api/entities/{id} строк с этим entity_id в entity_items не останется
        """
        entity = client.post('/api/entities', json={'name': 'git-helper'}).json()
        client.post(f'/api/entities/{entity["id"]}/items', json={'name': '/commit'})

        response = client.delete(f'/api/entities/{entity["id"]}')
        assert response.status_code == 204

        remaining = db_connection.execute(
            select(func.count()).select_from(entity_items).where(entity_items.c.entity_id == entity['id'])
        ).scalar_one()
        assert remaining == 0
