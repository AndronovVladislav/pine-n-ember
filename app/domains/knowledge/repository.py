from sqlalchemy import Column, Table, delete, func, insert, select, update

from app.domains._repository import SqlAlchemyRepository
from app.domains.errors import InvalidOperation, NotFound
from app.domains.ids import gen_id
from app.domains.knowledge import models
from app.domains.knowledge.dto import Block, BlockWithTopics, Concept, KnowledgeView, Topic
from app.domains.knowledge.ports import UNSET


def _block_from_row(row) -> Block:
    return Block(id=row.id, name=row.name, position=row.position)


def _topic_from_row(row, topic_concepts: list[Concept]) -> Topic:
    return Topic(
        id=row.id,
        block_id=row.block_id,
        name=row.name,
        description=row.description or '',
        concepts=topic_concepts,
    )


def _concept_from_row(row) -> Concept:
    return Concept(id=row.id, topic_id=row.topic_id, name=row.name, description=row.description or '')


def _reposition_in_parent(conn, table: Table, parent_col: Column, item_id: str, parent_value, index: int) -> int:
    """Вставляет item_id в упорядоченный список "соседей" (той же parent_col) на позицию index,
    сдвигая позиции остальных, и возвращает итоговую (зажатую в границы списка) позицию."""
    where = parent_col.is_(None) if parent_value is None else parent_col == parent_value
    siblings = [
        row.id
        for row in conn.execute(select(table.c.id).where(where, table.c.id != item_id).order_by(table.c.position))
    ]
    index = max(0, min(index, len(siblings)))
    siblings.insert(index, item_id)
    for position, sibling_id in enumerate(siblings):
        if sibling_id != item_id:
            conn.execute(update(table).where(table.c.id == sibling_id).values(position=position))
    return index


class SqlAlchemyKnowledgeRepository(SqlAlchemyRepository):
    def get_knowledge(self) -> KnowledgeView:
        conn = self._conn
        block_rows = conn.execute(select(models.Block).order_by(models.Block.position)).all()
        topic_rows = conn.execute(select(models.Topic).order_by(models.Topic.position)).all()
        concept_rows = conn.execute(select(models.Concept).order_by(models.Concept.position)).all()

        concepts_by_topic: dict[str, list[Concept]] = {}
        for concept_row in concept_rows:
            concepts_by_topic.setdefault(concept_row.topic_id, []).append(_concept_from_row(concept_row))

        topics_by_block: dict[str, list[Topic]] = {}
        ungrouped_topics: list[Topic] = []
        for topic_row in topic_rows:
            topic = _topic_from_row(topic_row, concepts_by_topic.get(topic_row.id, []))
            if topic_row.block_id is None:
                ungrouped_topics.append(topic)
            else:
                topics_by_block.setdefault(topic_row.block_id, []).append(topic)

        block_views = [
            BlockWithTopics(block=_block_from_row(row), topics=topics_by_block.get(row.id, [])) for row in block_rows
        ]
        return KnowledgeView(blocks=block_views, topics=ungrouped_topics)

    def create_block(self, name: str) -> Block:
        conn = self._conn
        block_id = gen_id()
        max_pos = conn.execute(select(func.coalesce(func.max(models.Block.position), -1))).scalar_one()
        conn.execute(insert(models.Block).values(id=block_id, name=name, position=max_pos + 1))
        conn.commit()
        row = conn.execute(select(models.Block).where(models.Block.id == block_id)).one()
        return _block_from_row(row)

    def update_block(self, block_id: str, name: str | None) -> Block:
        conn = self._conn
        row = conn.execute(select(models.Block).where(models.Block.id == block_id)).first()
        if not row:
            raise NotFound(f'block {block_id!r} not found')

        new_name = row.name
        if name is not None:
            new_name = name.strip() or row.name

        conn.execute(update(models.Block).where(models.Block.id == block_id).values(name=new_name))
        conn.commit()
        row = conn.execute(select(models.Block).where(models.Block.id == block_id)).one()
        return _block_from_row(row)

    def reorder_blocks(self, keys: list[str]) -> None:
        conn = self._conn
        existing = {row.id for row in conn.execute(select(models.Block.id))}
        if set(keys) != existing:
            raise InvalidOperation('keys must match existing blocks exactly')
        for position, block_id in enumerate(keys):
            conn.execute(update(models.Block).where(models.Block.id == block_id).values(position=position))
        conn.commit()

    def delete_block(self, block_id: str) -> None:
        self._conn.execute(delete(models.Block).where(models.Block.id == block_id))
        self._conn.commit()

    def create_topic(self, name: str, description: str, block_id: str | None) -> Topic:
        conn = self._conn
        topic_id = gen_id()
        max_pos = conn.execute(select(func.coalesce(func.max(models.Topic.position), -1))).scalar_one()
        conn.execute(
            insert(models.Topic).values(
                id=topic_id, block_id=block_id, name=name, description=description, position=max_pos + 1
            )
        )
        conn.commit()
        row = conn.execute(select(models.Topic).where(models.Topic.id == topic_id)).one()
        return _topic_from_row(row, [])

    def update_topic(
        self,
        topic_id: str,
        *,
        name: str | None = None,
        description: str | None = None,
        block_id: str | object = UNSET,
        position: int | None = None,
    ) -> Topic:
        conn = self._conn
        row = conn.execute(select(models.Topic).where(models.Topic.id == topic_id)).first()
        if not row:
            raise NotFound(f'topic {topic_id!r} not found')

        new_name = row.name
        if name is not None:
            new_name = name.strip() or row.name

        new_description = row.description
        if description is not None:
            new_description = description

        new_block_id = row.block_id
        block_changed = block_id is not UNSET
        if block_changed:
            new_block_id = block_id

        if position is not None:
            new_position = _reposition_in_parent(
                conn, models.Topic.__table__, models.Topic.block_id, topic_id, new_block_id, position
            )
        elif block_changed and new_block_id != row.block_id:
            new_position = (
                conn.execute(
                    select(func.coalesce(func.max(models.Topic.position), -1)).where(
                        models.Topic.block_id.is_(None)
                        if new_block_id is None
                        else models.Topic.block_id == new_block_id
                    )
                ).scalar_one()
                + 1
            )
        else:
            new_position = row.position

        conn.execute(
            update(models.Topic)
            .where(models.Topic.id == topic_id)
            .values(name=new_name, description=new_description, block_id=new_block_id, position=new_position)
        )
        conn.commit()
        row = conn.execute(select(models.Topic).where(models.Topic.id == topic_id)).one()
        concept_rows = conn.execute(
            select(models.Concept).where(models.Concept.topic_id == topic_id).order_by(models.Concept.position)
        )
        return _topic_from_row(row, [_concept_from_row(concept_row) for concept_row in concept_rows])

    def delete_topic(self, topic_id: str) -> None:
        self._conn.execute(delete(models.Topic).where(models.Topic.id == topic_id))
        self._conn.commit()

    def create_concept(self, topic_id: str, name: str, description: str) -> Concept:
        conn = self._conn
        topic_row = conn.execute(select(models.Topic.id).where(models.Topic.id == topic_id)).first()
        if not topic_row:
            raise NotFound(f'topic {topic_id!r} not found')

        concept_id = gen_id()
        max_pos = conn.execute(
            select(func.coalesce(func.max(models.Concept.position), -1)).where(models.Concept.topic_id == topic_id)
        ).scalar_one()
        conn.execute(
            insert(models.Concept).values(
                id=concept_id, topic_id=topic_id, name=name, description=description, position=max_pos + 1
            )
        )
        conn.commit()
        row = conn.execute(select(models.Concept).where(models.Concept.id == concept_id)).one()
        return _concept_from_row(row)

    def update_concept(
        self,
        concept_id: str,
        *,
        name: str | None = None,
        description: str | None = None,
        topic_id: str | object = UNSET,
        position: int | None = None,
    ) -> Concept:
        conn = self._conn
        row = conn.execute(select(models.Concept).where(models.Concept.id == concept_id)).first()
        if not row:
            raise NotFound(f'concept {concept_id!r} not found')

        new_name = row.name
        if name is not None:
            new_name = name.strip() or row.name

        new_description = row.description
        if description is not None:
            new_description = description

        new_topic_id = row.topic_id
        topic_changed = topic_id is not UNSET and topic_id != row.topic_id
        if topic_changed:
            target_topic = conn.execute(select(models.Topic.id).where(models.Topic.id == topic_id)).first()
            if not target_topic:
                raise NotFound(f'topic {topic_id!r} not found')
            new_topic_id = topic_id

        if position is not None:
            new_position = _reposition_in_parent(
                conn, models.Concept.__table__, models.Concept.topic_id, concept_id, new_topic_id, position
            )
        elif topic_changed:
            new_position = (
                conn.execute(
                    select(func.coalesce(func.max(models.Concept.position), -1)).where(
                        models.Concept.topic_id == new_topic_id
                    )
                ).scalar_one()
                + 1
            )
        else:
            new_position = row.position

        conn.execute(
            update(models.Concept)
            .where(models.Concept.id == concept_id)
            .values(name=new_name, description=new_description, topic_id=new_topic_id, position=new_position)
        )
        conn.commit()
        row = conn.execute(select(models.Concept).where(models.Concept.id == concept_id)).one()
        return _concept_from_row(row)

    def delete_concept(self, concept_id: str) -> None:
        self._conn.execute(delete(models.Concept).where(models.Concept.id == concept_id))
        self._conn.commit()
