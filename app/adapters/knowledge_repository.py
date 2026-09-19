from sqlalchemy import Column, Connection, Table, delete, func, insert, select, update

from app.domain.errors import InvalidOperation, NotFound
from app.domain.ids import gen_id
from app.domain.models import Block, BlockWithTopics, Concept, KnowledgeView, Topic
from app.domain.ports import UNSET
from app.tables import blocks, concepts, topics


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


def _reposition_in_parent(
    conn: Connection, table: Table, parent_col: Column, item_id: str, parent_value, index: int
) -> int:
    """Вставляет item_id в упорядоченный список "соседей" (той же parent_col) на позицию index,
    сдвигая позиции остальных, и возвращает итоговую (зажатую в границы списка) позицию."""
    where = parent_col.is_(None) if parent_value is None else parent_col == parent_value
    siblings = [
        r.id for r in conn.execute(select(table.c.id).where(where, table.c.id != item_id).order_by(table.c.position))
    ]
    index = max(0, min(index, len(siblings)))
    siblings.insert(index, item_id)
    for position, sibling_id in enumerate(siblings):
        if sibling_id != item_id:
            conn.execute(update(table).where(table.c.id == sibling_id).values(position=position))
    return index


class SqlAlchemyKnowledgeRepository:
    def __init__(self, conn: Connection) -> None:
        self._conn = conn

    def close(self) -> None:
        self._conn.close()

    def get_knowledge(self) -> KnowledgeView:
        conn = self._conn
        block_rows = conn.execute(select(blocks).order_by(blocks.c.position)).all()
        topic_rows = conn.execute(select(topics).order_by(topics.c.position)).all()
        concept_rows = conn.execute(select(concepts).order_by(concepts.c.position)).all()

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
        max_pos = conn.execute(select(func.coalesce(func.max(blocks.c.position), -1))).scalar_one()
        conn.execute(insert(blocks).values(id=block_id, name=name, position=max_pos + 1))
        conn.commit()
        row = conn.execute(select(blocks).where(blocks.c.id == block_id)).one()
        return _block_from_row(row)

    def update_block(self, block_id: str, name: str | None) -> Block:
        conn = self._conn
        row = conn.execute(select(blocks).where(blocks.c.id == block_id)).first()
        if not row:
            raise NotFound(f'block {block_id!r} not found')

        new_name = row.name
        if name is not None:
            new_name = name.strip() or row.name

        conn.execute(update(blocks).where(blocks.c.id == block_id).values(name=new_name))
        conn.commit()
        row = conn.execute(select(blocks).where(blocks.c.id == block_id)).one()
        return _block_from_row(row)

    def reorder_blocks(self, keys: list[str]) -> None:
        conn = self._conn
        existing = {r.id for r in conn.execute(select(blocks.c.id))}
        if set(keys) != existing:
            raise InvalidOperation('keys must match existing blocks exactly')
        for position, block_id in enumerate(keys):
            conn.execute(update(blocks).where(blocks.c.id == block_id).values(position=position))
        conn.commit()

    def delete_block(self, block_id: str) -> None:
        self._conn.execute(delete(blocks).where(blocks.c.id == block_id))
        self._conn.commit()

    def create_topic(self, name: str, description: str, block_id: str | None) -> Topic:
        conn = self._conn
        topic_id = gen_id()
        max_pos = conn.execute(select(func.coalesce(func.max(topics.c.position), -1))).scalar_one()
        conn.execute(
            insert(topics).values(
                id=topic_id, block_id=block_id, name=name, description=description, position=max_pos + 1
            )
        )
        conn.commit()
        row = conn.execute(select(topics).where(topics.c.id == topic_id)).one()
        return _topic_from_row(row, [])

    def update_topic(
        self,
        topic_id: str,
        *,
        name: str | None = None,
        description: str | None = None,
        block_id=UNSET,
        position: int | None = None,
    ) -> Topic:
        conn = self._conn
        row = conn.execute(select(topics).where(topics.c.id == topic_id)).first()
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
            new_position = _reposition_in_parent(conn, topics, topics.c.block_id, topic_id, new_block_id, position)
        elif block_changed and new_block_id != row.block_id:
            new_position = (
                conn.execute(
                    select(func.coalesce(func.max(topics.c.position), -1)).where(
                        topics.c.block_id.is_(None) if new_block_id is None else topics.c.block_id == new_block_id
                    )
                ).scalar_one()
                + 1
            )
        else:
            new_position = row.position

        conn.execute(
            update(topics)
            .where(topics.c.id == topic_id)
            .values(name=new_name, description=new_description, block_id=new_block_id, position=new_position)
        )
        conn.commit()
        row = conn.execute(select(topics).where(topics.c.id == topic_id)).one()
        concept_rows = conn.execute(
            select(concepts).where(concepts.c.topic_id == topic_id).order_by(concepts.c.position)
        )
        return _topic_from_row(row, [_concept_from_row(r) for r in concept_rows])

    def delete_topic(self, topic_id: str) -> None:
        self._conn.execute(delete(topics).where(topics.c.id == topic_id))
        self._conn.commit()

    def create_concept(self, topic_id: str, name: str, description: str) -> Concept:
        conn = self._conn
        topic_row = conn.execute(select(topics.c.id).where(topics.c.id == topic_id)).first()
        if not topic_row:
            raise NotFound(f'topic {topic_id!r} not found')

        concept_id = gen_id()
        max_pos = conn.execute(
            select(func.coalesce(func.max(concepts.c.position), -1)).where(concepts.c.topic_id == topic_id)
        ).scalar_one()
        conn.execute(
            insert(concepts).values(
                id=concept_id, topic_id=topic_id, name=name, description=description, position=max_pos + 1
            )
        )
        conn.commit()
        row = conn.execute(select(concepts).where(concepts.c.id == concept_id)).one()
        return _concept_from_row(row)

    def update_concept(
        self,
        concept_id: str,
        *,
        name: str | None = None,
        description: str | None = None,
        topic_id=UNSET,
        position: int | None = None,
    ) -> Concept:
        conn = self._conn
        row = conn.execute(select(concepts).where(concepts.c.id == concept_id)).first()
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
            target_topic = conn.execute(select(topics.c.id).where(topics.c.id == topic_id)).first()
            if not target_topic:
                raise NotFound(f'topic {topic_id!r} not found')
            new_topic_id = topic_id

        if position is not None:
            new_position = _reposition_in_parent(
                conn, concepts, concepts.c.topic_id, concept_id, new_topic_id, position
            )
        elif topic_changed:
            new_position = (
                conn.execute(
                    select(func.coalesce(func.max(concepts.c.position), -1)).where(concepts.c.topic_id == new_topic_id)
                ).scalar_one()
                + 1
            )
        else:
            new_position = row.position

        conn.execute(
            update(concepts)
            .where(concepts.c.id == concept_id)
            .values(name=new_name, description=new_description, topic_id=new_topic_id, position=new_position)
        )
        conn.commit()
        row = conn.execute(select(concepts).where(concepts.c.id == concept_id)).one()
        return _concept_from_row(row)

    def delete_concept(self, concept_id: str) -> None:
        self._conn.execute(delete(concepts).where(concepts.c.id == concept_id))
        self._conn.commit()
