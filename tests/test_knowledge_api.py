import pytest
from sqlalchemy import func, select

from app.tables import blocks, concepts, topics


def block_row_as_dict(conn, block_id):
    row = conn.execute(select(blocks).where(blocks.c.id == block_id)).one()
    return {k: v for k, v in row._mapping.items() if k != 'id'}


def topic_row_as_dict(conn, topic_id):
    row = conn.execute(select(topics).where(topics.c.id == topic_id)).one()
    return {k: v for k, v in row._mapping.items() if k != 'id'}


def concept_row_as_dict(conn, concept_id):
    row = conn.execute(select(concepts).where(concepts.c.id == concept_id)).one()
    return {k: v for k, v in row._mapping.items() if k != 'id'}


@pytest.mark.spec('0007')
class TestCreateBlock:
    def test_row_is_persisted_fully(self, client, db_connection):
        """
        Тест проверяет создание блока через POST /api/blocks.

        Ожидание: в blocks появится ровно одна запись с переданным name и position=0
        """
        response = client.post('/api/blocks', json={'name': 'Backend'})
        assert response.status_code == 200
        body = response.json()

        assert block_row_as_dict(db_connection, body['id']) == {
            'name': 'Backend',
            'position': 0,
        }

    def test_second_block_gets_next_position(self, client, db_connection):
        """
        Тест проверяет, что позиция нового блока считается как max(position) + 1 среди
        существующих блоков, аналогично тому как это сделано для задач и тем.

        Ожидание: первый блок получит position=0, второй - position=1
        """
        first = client.post('/api/blocks', json={'name': 'Backend'}).json()
        second = client.post('/api/blocks', json={'name': 'Frontend'}).json()

        assert block_row_as_dict(db_connection, first['id'])['position'] == 0
        assert block_row_as_dict(db_connection, second['id'])['position'] == 1


@pytest.mark.spec('0007')
class TestUpdateBlock:
    def test_renames_block(self, client, db_connection):
        """
        Тест проверяет переименование блока через PATCH /api/blocks/{id}.

        Ожидание: name блока меняется, остальные поля не затрагиваются
        """
        block = client.post('/api/blocks', json={'name': 'Backend'}).json()

        response = client.patch(f'/api/blocks/{block["id"]}', json={'name': 'Backend & Infra'})
        assert response.status_code == 200

        assert block_row_as_dict(db_connection, block['id']) == {
            'name': 'Backend & Infra',
            'position': 0,
        }


@pytest.mark.spec('0007')
class TestDeleteBlock:
    def test_ungroups_its_topics_instead_of_deleting_them(self, client, db_connection):
        """
        Тест проверяет, что удаление блока не удаляет темы внутри него, а только обнуляет
        их block_id (ON DELETE SET NULL) - тема не должна пропадать из базы знаний.

        Ожидание: после DELETE /api/blocks/{id} тема остаётся в topics, но с block_id=None
        """
        block = client.post('/api/blocks', json={'name': 'Backend'}).json()
        topic = client.post('/api/topics', json={'name': 'API', 'block_id': block['id']}).json()

        response = client.delete(f'/api/blocks/{block["id"]}')
        assert response.status_code == 204

        assert topic_row_as_dict(db_connection, topic['id'])['block_id'] is None


@pytest.mark.spec('0007')
class TestCreateTopic:
    def test_without_block_row_is_persisted_fully(self, client, db_connection):
        """
        Тест проверяет создание темы через POST /api/topics без указания блока.

        Ожидание: в topics появится запись с block_id=None, позицией 0 и пустой metadata='{}',
        остальные поля - как переданы в запросе
        """
        response = client.post('/api/topics', json={'name': 'git-helper', 'description': 'тема про git'})
        assert response.status_code == 200
        body = response.json()

        assert topic_row_as_dict(db_connection, body['id']) == {
            'block_id': None,
            'name': 'git-helper',
            'description': 'тема про git',
            'position': 0,
            'metadata': '{}',
        }

    def test_with_block_id_is_linked_to_that_block(self, client, db_connection):
        """
        Тест проверяет создание темы сразу внутри блока через POST /api/topics с block_id.

        Ожидание: block_id темы в БД совпадает с переданным
        """
        block = client.post('/api/blocks', json={'name': 'Backend'}).json()

        response = client.post('/api/topics', json={'name': 'API', 'block_id': block['id']})
        assert response.status_code == 200

        assert topic_row_as_dict(db_connection, response.json()['id'])['block_id'] == block['id']

    def test_second_topic_gets_next_position(self, client, db_connection):
        """
        Тест проверяет, что позиция новой темы считается как max(position) + 1 среди
        существующих тем, аналогично тому как это уже сделано для задач в tasks.

        Ожидание: первая тема получит position=0, вторая - position=1
        """
        first = client.post('/api/topics', json={'name': 'first'}).json()
        second = client.post('/api/topics', json={'name': 'second'}).json()

        assert topic_row_as_dict(db_connection, first['id'])['position'] == 0
        assert topic_row_as_dict(db_connection, second['id'])['position'] == 1


@pytest.mark.spec('0007')
class TestUpdateTopic:
    def test_can_move_topic_into_a_block(self, client, db_connection):
        """
        Тест проверяет перенос темы без блока в блок через PATCH /api/topics/{id}.

        Ожидание: block_id темы в БД становится равным id блока
        """
        topic = client.post('/api/topics', json={'name': 'API'}).json()
        block = client.post('/api/blocks', json={'name': 'Backend'}).json()

        response = client.patch(f'/api/topics/{topic["id"]}', json={'block_id': block['id']})
        assert response.status_code == 200

        assert topic_row_as_dict(db_connection, topic['id'])['block_id'] == block['id']

    def test_can_ungroup_topic_with_explicit_null(self, client, db_connection):
        """
        Тест проверяет разгруппировку темы через PATCH /api/topics/{id} с явным block_id=null.

        Ожидание: block_id темы в БД становится None
        """
        block = client.post('/api/blocks', json={'name': 'Backend'}).json()
        topic = client.post('/api/topics', json={'name': 'API', 'block_id': block['id']}).json()

        response = client.patch(f'/api/topics/{topic["id"]}', json={'block_id': None})
        assert response.status_code == 200

        assert topic_row_as_dict(db_connection, topic['id'])['block_id'] is None

    def test_partial_update_keeps_untouched_fields(self, client, db_connection):
        """
        Тест проверяет частичное обновление темы через PATCH /api/topics/{id} -
        меняем только description, name и block_id должны остаться прежними.

        Ожидание: полная строка в БД совпадёт с исходной, кроме изменённого поля description
        """
        topic = client.post('/api/topics', json={'name': 'API', 'description': 'old'}).json()

        response = client.patch(f'/api/topics/{topic["id"]}', json={'description': 'new'})
        assert response.status_code == 200

        assert topic_row_as_dict(db_connection, topic['id']) == {
            'block_id': None,
            'name': 'API',
            'description': 'new',
            'position': 0,
            'metadata': '{}',
        }


@pytest.mark.spec('0007')
class TestDeleteTopic:
    def test_cascades_to_its_concepts(self, client, db_connection):
        """
        Тест проверяет, что удаление темы удаляет и все её понятия через
        ON DELETE CASCADE на concepts.topic_id, без ручной очистки в коде хендлера.

        Ожидание: после DELETE /api/topics/{id} строк с этим topic_id в concepts не останется
        """
        topic = client.post('/api/topics', json={'name': 'API'}).json()
        client.post(f'/api/topics/{topic["id"]}/concepts', json={'name': 'Definition'})

        response = client.delete(f'/api/topics/{topic["id"]}')
        assert response.status_code == 204

        remaining = db_connection.execute(
            select(func.count()).select_from(concepts).where(concepts.c.topic_id == topic['id'])
        ).scalar_one()
        assert remaining == 0


@pytest.mark.spec('0007')
class TestCreateConcept:
    def test_row_is_persisted_fully(self, client, db_connection):
        """
        Тест проверяет создание понятия внутри темы через POST /api/topics/{id}/concepts.

        Ожидание: в concepts появится запись, привязанная к topic_id родительской темы,
        position=0, metadata='{}' - сравниваем полную строку из БД
        """
        topic = client.post('/api/topics', json={'name': 'API'}).json()

        response = client.post(
            f'/api/topics/{topic["id"]}/concepts',
            json={'name': 'Definition', 'description': 'что это такое'},
        )
        assert response.status_code == 200
        body = response.json()

        assert concept_row_as_dict(db_connection, body['id']) == {
            'topic_id': topic['id'],
            'name': 'Definition',
            'description': 'что это такое',
            'position': 0,
            'metadata': '{}',
        }

    def test_missing_topic__returns_404(self, client):
        """
        Тест проверяет добавление понятия к несуществующей теме.

        Ожидание: сервер вернёт 404, запись в concepts не создастся
        """
        response = client.post('/api/topics/does-not-exist/concepts', json={'name': 'Definition'})
        assert response.status_code == 404


@pytest.mark.spec('0007')
class TestUpdateConcept:
    def test_partial_update_keeps_untouched_fields(self, client, db_connection):
        """
        Тест проверяет частичное обновление понятия через PATCH /api/concepts/{id} -
        меняем только description, name должен остаться прежним.

        Ожидание: полная строка в БД совпадёт с исходной, кроме изменённого поля description
        """
        topic = client.post('/api/topics', json={'name': 'API'}).json()
        concept = client.post(
            f'/api/topics/{topic["id"]}/concepts', json={'name': 'Definition', 'description': 'old'}
        ).json()

        response = client.patch(f'/api/concepts/{concept["id"]}', json={'description': 'new'})
        assert response.status_code == 200

        assert concept_row_as_dict(db_connection, concept['id']) == {
            'topic_id': topic['id'],
            'name': 'Definition',
            'description': 'new',
            'position': 0,
            'metadata': '{}',
        }


@pytest.mark.spec('0007')
class TestGetKnowledge:
    def test_groups_topics_by_block_with_nested_concepts(self, client):
        """
        Тест проверяет агрегирующий эндпоинт GET /api/knowledge: темы внутри блока
        рендерятся вложенными в этот блок, вместе со своими понятиями.

        Ожидание: в ответе один блок с одной вложенной темой и двумя понятиями в
        порядке их position
        """
        block = client.post('/api/blocks', json={'name': 'Backend'}).json()
        topic = client.post('/api/topics', json={'name': 'API', 'block_id': block['id']}).json()
        client.post(f'/api/topics/{topic["id"]}/concepts', json={'name': 'Definition'})
        client.post(f'/api/topics/{topic["id"]}/concepts', json={'name': 'Types'})

        response = client.get('/api/knowledge')
        assert response.status_code == 200
        body = response.json()

        assert len(body['blocks']) == 1
        assert body['blocks'][0]['id'] == block['id']
        assert len(body['blocks'][0]['topics']) == 1
        assert body['blocks'][0]['topics'][0]['id'] == topic['id']
        assert [c['name'] for c in body['blocks'][0]['topics'][0]['concepts']] == ['Definition', 'Types']
        assert body['topics'] == []

    def test_topics_without_block_are_listed_separately(self, client):
        """
        Тест проверяет, что темы без блока (в том числе бывшие "скиллы" после миграции)
        попадают в отдельный список topics, а не теряются и не попадают ни в один блок.

        Ожидание: тема без block_id оказывается в body['topics'], блоков в ответе нет
        """
        client.post('/api/topics', json={'name': 'git-helper'})

        response = client.get('/api/knowledge')
        body = response.json()

        assert body['blocks'] == []
        assert len(body['topics']) == 1
        assert body['topics'][0]['name'] == 'git-helper'


@pytest.mark.spec('0008')
class TestReorderBlocks:
    def test_reassigns_positions_in_given_order(self, client, db_connection):
        """
        Тест проверяет реордер блоков через PUT /api/blocks/reorder - по образцу реордера
        статусов на доске.

        Ожидание: после reorder с обратным порядком id позиции блоков в БД тоже меняются местами
        """
        first = client.post('/api/blocks', json={'name': 'Backend'}).json()
        second = client.post('/api/blocks', json={'name': 'Frontend'}).json()

        response = client.put('/api/blocks/reorder', json={'keys': [second['id'], first['id']]})
        assert response.status_code == 200

        assert block_row_as_dict(db_connection, second['id'])['position'] == 0
        assert block_row_as_dict(db_connection, first['id'])['position'] == 1

    def test_mismatched_keys__returns_400(self, client):
        """
        Тест проверяет защиту от рассинхронизации: набор ключей в запросе должен полностью
        совпадать с существующими блоками, иначе это может привести к потере позиций.

        Ожидание: 400, если передан несуществующий id блока
        """
        client.post('/api/blocks', json={'name': 'Backend'})

        response = client.put('/api/blocks/reorder', json={'keys': ['does-not-exist']})

        assert response.status_code == 400


@pytest.mark.spec('0008')
class TestMoveConceptBetweenTopics:
    def test_moves_concept_to_another_topic_appending_at_the_end(self, client, db_connection):
        """
        Тест проверяет перенос понятия в другую тему через PATCH /api/concepts/{id} с topic_id -
        аналог переноса темы между блоками, но на уровень ниже.

        Ожидание: topic_id понятия в БД меняется на новый, position становится следующей
        свободной позицией среди понятий целевой темы (там уже есть одно понятие с position=0)
        """
        source_topic = client.post('/api/topics', json={'name': 'API'}).json()
        target_topic = client.post('/api/topics', json={'name': 'Rate limiting'}).json()
        client.post(f'/api/topics/{target_topic["id"]}/concepts', json={'name': 'RPS'})
        concept = client.post(f'/api/topics/{source_topic["id"]}/concepts', json={'name': 'Definition'}).json()

        response = client.patch(f'/api/concepts/{concept["id"]}', json={'topic_id': target_topic['id']})
        assert response.status_code == 200

        assert concept_row_as_dict(db_connection, concept['id']) == {
            'topic_id': target_topic['id'],
            'name': 'Definition',
            'description': '',
            'position': 1,
            'metadata': '{}',
        }

    def test_missing_target_topic__returns_404(self, client):
        """
        Тест проверяет перенос понятия в несуществующую тему.

        Ожидание: 404, понятие не переносится
        """
        topic = client.post('/api/topics', json={'name': 'API'}).json()
        concept = client.post(f'/api/topics/{topic["id"]}/concepts', json={'name': 'Definition'}).json()

        response = client.patch(f'/api/concepts/{concept["id"]}', json={'topic_id': 'does-not-exist'})

        assert response.status_code == 404


@pytest.mark.spec('0009')
class TestReorderTopicWithinBlock:
    def test_inserts_topic_at_position_and_shifts_siblings(self, client, db_connection):
        """
        Тест проверяет точную вставку темы внутри одного блока через PATCH /api/topics/{id}
        с position - аналог перетаскивания темы на конкретное место в строке, а не в конец.

        Ожидание: тема "C" (изначально в конце) вставляется на позицию 0, темы "A" и "B"
        сдвигаются на 1 и 2 соответственно
        """
        block = client.post('/api/blocks', json={'name': 'Backend'}).json()
        a = client.post('/api/topics', json={'name': 'A', 'block_id': block['id']}).json()
        b = client.post('/api/topics', json={'name': 'B', 'block_id': block['id']}).json()
        c = client.post('/api/topics', json={'name': 'C', 'block_id': block['id']}).json()

        response = client.patch(f'/api/topics/{c["id"]}', json={'block_id': block['id'], 'position': 0})
        assert response.status_code == 200

        assert topic_row_as_dict(db_connection, c['id'])['position'] == 0
        assert topic_row_as_dict(db_connection, a['id'])['position'] == 1
        assert topic_row_as_dict(db_connection, b['id'])['position'] == 2

    def test_position_beyond_list_length_clamps_to_the_end(self, client, db_connection):
        """
        Тест проверяет защиту от некорректного position - большего, чем количество тем в блоке.

        Ожидание: тема просто оказывается в конце списка (position = 1), без ошибки
        """
        block = client.post('/api/blocks', json={'name': 'Backend'}).json()
        a = client.post('/api/topics', json={'name': 'A', 'block_id': block['id']}).json()
        b = client.post('/api/topics', json={'name': 'B', 'block_id': block['id']}).json()

        response = client.patch(f'/api/topics/{a["id"]}', json={'position': 99})
        assert response.status_code == 200

        assert topic_row_as_dict(db_connection, a['id'])['position'] == 1
        assert topic_row_as_dict(db_connection, b['id'])['position'] == 0


@pytest.mark.spec('0009')
class TestMoveTopicBetweenBlocksWithPosition:
    def test_inserts_at_position_in_target_block(self, client, db_connection):
        """
        Тест проверяет перенос темы в другой блок сразу на конкретную позицию (не в конец) -
        точное перетаскивание между блоками, а не просто "куда-то в целевой блок".

        Ожидание: тема из block1 вставляется в block2 на позицию 0, существующая тема
        block2 сдвигается на позицию 1
        """
        block1 = client.post('/api/blocks', json={'name': 'Backend'}).json()
        block2 = client.post('/api/blocks', json={'name': 'Frontend'}).json()
        moved = client.post('/api/topics', json={'name': 'API', 'block_id': block1['id']}).json()
        existing = client.post('/api/topics', json={'name': 'UI kit', 'block_id': block2['id']}).json()

        response = client.patch(f'/api/topics/{moved["id"]}', json={'block_id': block2['id'], 'position': 0})
        assert response.status_code == 200

        assert topic_row_as_dict(db_connection, moved['id']) == {
            'block_id': block2['id'],
            'name': 'API',
            'description': '',
            'position': 0,
            'metadata': '{}',
        }
        assert topic_row_as_dict(db_connection, existing['id'])['position'] == 1


@pytest.mark.spec('0009')
class TestReorderConceptWithinTopic:
    def test_inserts_concept_at_position_and_shifts_siblings(self, client, db_connection):
        """
        Тест проверяет точную вставку понятия внутри одной темы через PATCH /api/concepts/{id}
        с position.

        Ожидание: понятие "Types" (изначально второе) переносится на позицию 0, "Definition"
        сдвигается на позицию 1
        """
        topic = client.post('/api/topics', json={'name': 'API'}).json()
        definition = client.post(f'/api/topics/{topic["id"]}/concepts', json={'name': 'Definition'}).json()
        types_ = client.post(f'/api/topics/{topic["id"]}/concepts', json={'name': 'Types'}).json()

        response = client.patch(f'/api/concepts/{types_["id"]}', json={'position': 0})
        assert response.status_code == 200

        assert concept_row_as_dict(db_connection, types_['id'])['position'] == 0
        assert concept_row_as_dict(db_connection, definition['id'])['position'] == 1

    def test_negative_position_clamps_to_the_start(self, client, db_connection):
        """
        Тест проверяет защиту от отрицательного position.

        Ожидание: понятие оказывается в начале списка (position = 0), без ошибки
        """
        topic = client.post('/api/topics', json={'name': 'API'}).json()
        a = client.post(f'/api/topics/{topic["id"]}/concepts', json={'name': 'A'}).json()
        b = client.post(f'/api/topics/{topic["id"]}/concepts', json={'name': 'B'}).json()

        response = client.patch(f'/api/concepts/{b["id"]}', json={'position': -5})
        assert response.status_code == 200

        assert concept_row_as_dict(db_connection, b['id'])['position'] == 0
        assert concept_row_as_dict(db_connection, a['id'])['position'] == 1


@pytest.mark.spec('0009')
class TestMoveConceptBetweenTopicsWithPosition:
    def test_inserts_at_position_in_target_topic(self, client, db_connection):
        """
        Тест проверяет перенос понятия в другую тему сразу на конкретную позицию.

        Ожидание: понятие вставляется в целевую тему на позицию 0, существующее понятие
        целевой темы сдвигается на позицию 1
        """
        source = client.post('/api/topics', json={'name': 'API'}).json()
        target = client.post('/api/topics', json={'name': 'Rate limiting'}).json()
        moved = client.post(f'/api/topics/{source["id"]}/concepts', json={'name': 'Definition'}).json()
        existing = client.post(f'/api/topics/{target["id"]}/concepts', json={'name': 'RPS'}).json()

        response = client.patch(f'/api/concepts/{moved["id"]}', json={'topic_id': target['id'], 'position': 0})
        assert response.status_code == 200

        assert concept_row_as_dict(db_connection, moved['id']) == {
            'topic_id': target['id'],
            'name': 'Definition',
            'description': '',
            'position': 0,
            'metadata': '{}',
        }
        assert concept_row_as_dict(db_connection, existing['id'])['position'] == 1
