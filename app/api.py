from fastapi import APIRouter, HTTPException
from sqlalchemy import delete, func, insert, select, update

from app.db import get_connection
from app.logic import entity_item_row_to_dict, entity_row_to_dict, gen_id, resolve_status, resolve_tag, task_row_to_dict
from app.schemas import (
    EntityCreate,
    EntityItemCreate,
    EntityItemOut,
    EntityItemUpdate,
    EntityOut,
    EntityUpdate,
    StatusReorder,
    TaskCreate,
    TaskMove,
    TaskOut,
    TaskUpdate,
)
from app.tables import entities, entity_items, statuses, tags, tasks

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
def get_knowledge(kind: str = 'skill'):
    conn = get_connection()
    try:
        entity_rows = conn.execute(select(entities).where(entities.c.kind == kind).order_by(entities.c.position)).all()
        item_rows = conn.execute(
            select(entity_items)
            .where(entity_items.c.entity_id.in_(select(entities.c.id).where(entities.c.kind == kind)))
            .order_by(entity_items.c.position)
        ).all()

        items_by_entity: dict[str, list[dict]] = {}
        for item_row in item_rows:
            items_by_entity.setdefault(item_row.entity_id, []).append(entity_item_row_to_dict(item_row))

        result_entities = [entity_row_to_dict(row, items_by_entity.get(row.id, [])) for row in entity_rows]
        return {'entities': result_entities}
    finally:
        conn.close()


@router.post('/entities', response_model=EntityOut)
def create_entity(payload: EntityCreate):
    conn = get_connection()
    try:
        name = payload.name.strip()
        if not name:
            raise HTTPException(400, 'name is required')
        entity_id = gen_id()
        max_pos = conn.execute(
            select(func.coalesce(func.max(entities.c.position), -1)).where(entities.c.kind == payload.kind)
        ).scalar_one()
        conn.execute(
            insert(entities).values(
                id=entity_id,
                kind=payload.kind,
                name=name,
                description=payload.description,
                position=max_pos + 1,
            )
        )
        conn.commit()
        row = conn.execute(select(entities).where(entities.c.id == entity_id)).one()
        return entity_row_to_dict(row)
    finally:
        conn.close()


@router.patch('/entities/{entity_id}', response_model=EntityOut)
def update_entity(entity_id: str, payload: EntityUpdate):
    conn = get_connection()
    try:
        row = conn.execute(select(entities).where(entities.c.id == entity_id)).first()
        if not row:
            raise HTTPException(404, 'entity not found')

        name = row.name
        if payload.name is not None:
            stripped = payload.name.strip()
            name = stripped or row.name

        description = row.description
        if payload.description is not None:
            description = payload.description

        conn.execute(update(entities).where(entities.c.id == entity_id).values(name=name, description=description))
        conn.commit()
        row = conn.execute(select(entities).where(entities.c.id == entity_id)).one()
        return entity_row_to_dict(row)
    finally:
        conn.close()


@router.delete('/entities/{entity_id}', status_code=204)
def delete_entity(entity_id: str):
    conn = get_connection()
    try:
        conn.execute(delete(entities).where(entities.c.id == entity_id))
        conn.commit()
    finally:
        conn.close()


@router.post('/entities/{entity_id}/items', response_model=EntityItemOut)
def create_entity_item(entity_id: str, payload: EntityItemCreate):
    conn = get_connection()
    try:
        entity_row = conn.execute(select(entities.c.id).where(entities.c.id == entity_id)).first()
        if not entity_row:
            raise HTTPException(404, 'entity not found')

        name = payload.name.strip()
        if not name:
            raise HTTPException(400, 'name is required')
        item_id = gen_id()
        max_pos = conn.execute(
            select(func.coalesce(func.max(entity_items.c.position), -1)).where(entity_items.c.entity_id == entity_id)
        ).scalar_one()
        conn.execute(
            insert(entity_items).values(
                id=item_id,
                entity_id=entity_id,
                kind=payload.kind,
                name=name,
                description=payload.description,
                position=max_pos + 1,
            )
        )
        conn.commit()
        row = conn.execute(select(entity_items).where(entity_items.c.id == item_id)).one()
        return entity_item_row_to_dict(row)
    finally:
        conn.close()


@router.patch('/items/{item_id}', response_model=EntityItemOut)
def update_entity_item(item_id: str, payload: EntityItemUpdate):
    conn = get_connection()
    try:
        row = conn.execute(select(entity_items).where(entity_items.c.id == item_id)).first()
        if not row:
            raise HTTPException(404, 'item not found')

        name = row.name
        if payload.name is not None:
            stripped = payload.name.strip()
            name = stripped or row.name

        description = row.description
        if payload.description is not None:
            description = payload.description

        conn.execute(
            update(entity_items).where(entity_items.c.id == item_id).values(name=name, description=description)
        )
        conn.commit()
        row = conn.execute(select(entity_items).where(entity_items.c.id == item_id)).one()
        return entity_item_row_to_dict(row)
    finally:
        conn.close()


@router.delete('/items/{item_id}', status_code=204)
def delete_entity_item(item_id: str):
    conn = get_connection()
    try:
        conn.execute(delete(entity_items).where(entity_items.c.id == item_id))
        conn.commit()
    finally:
        conn.close()
