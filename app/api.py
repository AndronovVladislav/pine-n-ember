from fastapi import APIRouter, HTTPException
from sqlalchemy import delete, func, insert, select, update

from app.db import get_connection
from app.logic import (
    block_row_to_dict,
    concept_row_to_dict,
    gen_id,
    reposition_in_parent,
    resolve_status,
    resolve_tag,
    task_row_to_dict,
    topic_row_to_dict,
)
from app.schemas import (
    BlockCreate,
    BlockOut,
    BlockReorder,
    BlockUpdate,
    ConceptCreate,
    ConceptOut,
    ConceptUpdate,
    StatusReorder,
    TaskCreate,
    TaskMove,
    TaskOut,
    TaskUpdate,
    TopicCreate,
    TopicOut,
    TopicUpdate,
)
from app.tables import blocks, concepts, statuses, tags, tasks, topics

router = APIRouter(prefix='/api')


@router.get('/board')
def get_board():
    conn = get_connection()
    try:
        status_rows = [
            {'key': r.key, 'label': r.label, 'color': r.color}
            for r in conn.execute(select(statuses).order_by(statuses.c.position))
        ]
        tag_rows = [
            {'key': r.key, 'label': r.label, 'bg': r.bg, 'text': r.text_color} for r in conn.execute(select(tags))
        ]
        task_rows = [task_row_to_dict(r) for r in conn.execute(select(tasks).order_by(tasks.c.position))]
        return {'statuses': status_rows, 'tags': tag_rows, 'tasks': task_rows}
    finally:
        conn.close()


@router.post('/tasks', response_model=TaskOut)
def create_task(payload: TaskCreate):
    conn = get_connection()
    try:
        title = payload.title.strip()
        if not title:
            raise HTTPException(400, 'title is required')
        tag_key = resolve_tag(conn, payload.tag)
        status_key = resolve_status(conn, payload.status)
        task_id = gen_id()
        max_pos = conn.execute(
            select(func.coalesce(func.max(tasks.c.position), -1)).where(tasks.c.status_key == status_key)
        ).scalar_one()
        conn.execute(
            insert(tasks).values(
                id=task_id,
                title=title,
                tag_key=tag_key,
                due=payload.due.strip(),
                status_key=status_key,
                description='',
                position=max_pos + 1,
            )
        )
        conn.commit()
        row = conn.execute(select(tasks).where(tasks.c.id == task_id)).one()
        return task_row_to_dict(row)
    finally:
        conn.close()


@router.patch('/tasks/{task_id}', response_model=TaskOut)
def update_task(task_id: str, payload: TaskUpdate):
    conn = get_connection()
    try:
        row = conn.execute(select(tasks).where(tasks.c.id == task_id)).first()
        if not row:
            raise HTTPException(404, 'task not found')

        title = row.title
        if payload.title is not None:
            stripped = payload.title.strip()
            title = stripped or row.title

        tag_key = row.tag_key
        if payload.tag is not None:
            tag_key = resolve_tag(conn, payload.tag)

        status_key = row.status_key
        if payload.status is not None:
            status_key = resolve_status(conn, payload.status)

        due = row.due
        if payload.due is not None:
            due = payload.due.strip()

        description = row.description
        if payload.description is not None:
            description = payload.description

        conn.execute(
            update(tasks)
            .where(tasks.c.id == task_id)
            .values(title=title, tag_key=tag_key, due=due, status_key=status_key, description=description)
        )
        conn.commit()
        row = conn.execute(select(tasks).where(tasks.c.id == task_id)).one()
        return task_row_to_dict(row)
    finally:
        conn.close()


@router.put('/tasks/{task_id}/move', response_model=TaskOut)
def move_task(task_id: str, payload: TaskMove):
    conn = get_connection()
    try:
        row = conn.execute(select(tasks).where(tasks.c.id == task_id)).first()
        if not row:
            raise HTTPException(404, 'task not found')
        status = conn.execute(select(statuses.c.key).where(statuses.c.key == payload.status)).first()
        if not status:
            raise HTTPException(400, 'unknown status')
        max_pos = conn.execute(
            select(func.coalesce(func.max(tasks.c.position), -1)).where(tasks.c.status_key == payload.status)
        ).scalar_one()
        conn.execute(update(tasks).where(tasks.c.id == task_id).values(status_key=payload.status, position=max_pos + 1))
        conn.commit()
        row = conn.execute(select(tasks).where(tasks.c.id == task_id)).one()
        return task_row_to_dict(row)
    finally:
        conn.close()


@router.delete('/tasks/{task_id}', status_code=204)
def delete_task(task_id: str):
    conn = get_connection()
    try:
        conn.execute(delete(tasks).where(tasks.c.id == task_id))
        conn.commit()
    finally:
        conn.close()


@router.put('/statuses/reorder')
def reorder_statuses(payload: StatusReorder):
    conn = get_connection()
    try:
        existing = {r.key for r in conn.execute(select(statuses.c.key))}
        if set(payload.keys) != existing:
            raise HTTPException(400, 'keys must match existing statuses exactly')
        for position, key in enumerate(payload.keys):
            conn.execute(update(statuses).where(statuses.c.key == key).values(position=position))
        conn.commit()
        return {'ok': True}
    finally:
        conn.close()


@router.delete('/statuses/{status_key}', status_code=204)
def delete_status(status_key: str):
    conn = get_connection()
    try:
        count = conn.execute(select(func.count()).select_from(statuses)).scalar_one()
        if count <= 1:
            raise HTTPException(400, 'cannot delete the last status')
        conn.execute(delete(tasks).where(tasks.c.status_key == status_key))
        conn.execute(delete(statuses).where(statuses.c.key == status_key))
        conn.commit()
    finally:
        conn.close()


@router.get('/knowledge')
def get_knowledge():
    conn = get_connection()
    try:
        block_rows = conn.execute(select(blocks).order_by(blocks.c.position)).all()
        topic_rows = conn.execute(select(topics).order_by(topics.c.position)).all()
        concept_rows = conn.execute(select(concepts).order_by(concepts.c.position)).all()

        concepts_by_topic: dict[str, list[dict]] = {}
        for concept_row in concept_rows:
            concepts_by_topic.setdefault(concept_row.topic_id, []).append(concept_row_to_dict(concept_row))

        topics_by_block: dict[str, list[dict]] = {}
        ungrouped_topics: list[dict] = []
        for topic_row in topic_rows:
            topic_dict = topic_row_to_dict(topic_row, concepts_by_topic.get(topic_row.id, []))
            if topic_row.block_id is None:
                ungrouped_topics.append(topic_dict)
            else:
                topics_by_block.setdefault(topic_row.block_id, []).append(topic_dict)

        result_blocks = [{**block_row_to_dict(row), 'topics': topics_by_block.get(row.id, [])} for row in block_rows]
        return {'blocks': result_blocks, 'topics': ungrouped_topics}
    finally:
        conn.close()


@router.post('/blocks', response_model=BlockOut)
def create_block(payload: BlockCreate):
    conn = get_connection()
    try:
        name = payload.name.strip()
        if not name:
            raise HTTPException(400, 'name is required')
        block_id = gen_id()
        max_pos = conn.execute(select(func.coalesce(func.max(blocks.c.position), -1))).scalar_one()
        conn.execute(insert(blocks).values(id=block_id, name=name, position=max_pos + 1))
        conn.commit()
        row = conn.execute(select(blocks).where(blocks.c.id == block_id)).one()
        return block_row_to_dict(row)
    finally:
        conn.close()


@router.put('/blocks/reorder')
def reorder_blocks(payload: BlockReorder):
    conn = get_connection()
    try:
        existing = {r.id for r in conn.execute(select(blocks.c.id))}
        if set(payload.keys) != existing:
            raise HTTPException(400, 'keys must match existing blocks exactly')
        for position, block_id in enumerate(payload.keys):
            conn.execute(update(blocks).where(blocks.c.id == block_id).values(position=position))
        conn.commit()
        return {'ok': True}
    finally:
        conn.close()


@router.patch('/blocks/{block_id}', response_model=BlockOut)
def update_block(block_id: str, payload: BlockUpdate):
    conn = get_connection()
    try:
        row = conn.execute(select(blocks).where(blocks.c.id == block_id)).first()
        if not row:
            raise HTTPException(404, 'block not found')

        name = row.name
        if payload.name is not None:
            stripped = payload.name.strip()
            name = stripped or row.name

        conn.execute(update(blocks).where(blocks.c.id == block_id).values(name=name))
        conn.commit()
        row = conn.execute(select(blocks).where(blocks.c.id == block_id)).one()
        return block_row_to_dict(row)
    finally:
        conn.close()


@router.delete('/blocks/{block_id}', status_code=204)
def delete_block(block_id: str):
    conn = get_connection()
    try:
        conn.execute(delete(blocks).where(blocks.c.id == block_id))
        conn.commit()
    finally:
        conn.close()


@router.post('/topics', response_model=TopicOut)
def create_topic(payload: TopicCreate):
    conn = get_connection()
    try:
        name = payload.name.strip()
        if not name:
            raise HTTPException(400, 'name is required')
        topic_id = gen_id()
        max_pos = conn.execute(select(func.coalesce(func.max(topics.c.position), -1))).scalar_one()
        conn.execute(
            insert(topics).values(
                id=topic_id,
                block_id=payload.block_id,
                name=name,
                description=payload.description,
                position=max_pos + 1,
            )
        )
        conn.commit()
        row = conn.execute(select(topics).where(topics.c.id == topic_id)).one()
        return topic_row_to_dict(row)
    finally:
        conn.close()


@router.patch('/topics/{topic_id}', response_model=TopicOut)
def update_topic(topic_id: str, payload: TopicUpdate):
    conn = get_connection()
    try:
        row = conn.execute(select(topics).where(topics.c.id == topic_id)).first()
        if not row:
            raise HTTPException(404, 'topic not found')

        fields_set = payload.model_fields_set

        name = row.name
        if payload.name is not None:
            stripped = payload.name.strip()
            name = stripped or row.name

        description = row.description
        if payload.description is not None:
            description = payload.description

        block_id = row.block_id
        if 'block_id' in fields_set:
            block_id = payload.block_id

        if payload.position is not None:
            position = reposition_in_parent(conn, topics, topics.c.block_id, topic_id, block_id, payload.position)
        elif 'block_id' in fields_set and block_id != row.block_id:
            position = (
                conn.execute(
                    select(func.coalesce(func.max(topics.c.position), -1)).where(
                        topics.c.block_id.is_(None) if block_id is None else topics.c.block_id == block_id
                    )
                ).scalar_one()
                + 1
            )
        else:
            position = row.position

        conn.execute(
            update(topics)
            .where(topics.c.id == topic_id)
            .values(name=name, description=description, block_id=block_id, position=position)
        )
        conn.commit()
        row = conn.execute(select(topics).where(topics.c.id == topic_id)).one()
        return topic_row_to_dict(row)
    finally:
        conn.close()


@router.delete('/topics/{topic_id}', status_code=204)
def delete_topic(topic_id: str):
    conn = get_connection()
    try:
        conn.execute(delete(topics).where(topics.c.id == topic_id))
        conn.commit()
    finally:
        conn.close()


@router.post('/topics/{topic_id}/concepts', response_model=ConceptOut)
def create_concept(topic_id: str, payload: ConceptCreate):
    conn = get_connection()
    try:
        topic_row = conn.execute(select(topics.c.id).where(topics.c.id == topic_id)).first()
        if not topic_row:
            raise HTTPException(404, 'topic not found')

        name = payload.name.strip()
        if not name:
            raise HTTPException(400, 'name is required')
        concept_id = gen_id()
        max_pos = conn.execute(
            select(func.coalesce(func.max(concepts.c.position), -1)).where(concepts.c.topic_id == topic_id)
        ).scalar_one()
        conn.execute(
            insert(concepts).values(
                id=concept_id,
                topic_id=topic_id,
                name=name,
                description=payload.description,
                position=max_pos + 1,
            )
        )
        conn.commit()
        row = conn.execute(select(concepts).where(concepts.c.id == concept_id)).one()
        return concept_row_to_dict(row)
    finally:
        conn.close()


@router.patch('/concepts/{concept_id}', response_model=ConceptOut)
def update_concept(concept_id: str, payload: ConceptUpdate):
    conn = get_connection()
    try:
        row = conn.execute(select(concepts).where(concepts.c.id == concept_id)).first()
        if not row:
            raise HTTPException(404, 'concept not found')

        name = row.name
        if payload.name is not None:
            stripped = payload.name.strip()
            name = stripped or row.name

        description = row.description
        if payload.description is not None:
            description = payload.description

        topic_id = row.topic_id
        topic_changed = payload.topic_id is not None and payload.topic_id != row.topic_id
        if topic_changed:
            target_topic = conn.execute(select(topics.c.id).where(topics.c.id == payload.topic_id)).first()
            if not target_topic:
                raise HTTPException(404, 'topic not found')
            topic_id = payload.topic_id

        if payload.position is not None:
            position = reposition_in_parent(conn, concepts, concepts.c.topic_id, concept_id, topic_id, payload.position)
        elif topic_changed:
            position = (
                conn.execute(
                    select(func.coalesce(func.max(concepts.c.position), -1)).where(concepts.c.topic_id == topic_id)
                ).scalar_one()
                + 1
            )
        else:
            position = row.position

        conn.execute(
            update(concepts)
            .where(concepts.c.id == concept_id)
            .values(name=name, description=description, topic_id=topic_id, position=position)
        )
        conn.commit()
        row = conn.execute(select(concepts).where(concepts.c.id == concept_id)).one()
        return concept_row_to_dict(row)
    finally:
        conn.close()


@router.delete('/concepts/{concept_id}', status_code=204)
def delete_concept(concept_id: str):
    conn = get_connection()
    try:
        conn.execute(delete(concepts).where(concepts.c.id == concept_id))
        conn.commit()
    finally:
        conn.close()
