import json
import random
import re
import string

from sqlalchemy import Column, Connection, Row, Table, func, insert, select, update

from app.tables import statuses, tags

COLOR_PALETTE = [
    '#FF9E64',
    '#FFB454',
    '#7FA37B',
    '#5FA88E',
    '#E8A87C',
    '#D97B5F',
    '#B98F5F',
    '#8FB89A',
]


def gen_id() -> str:
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=7))


def slug(text: str) -> str:
    return re.sub(r'\s+', '-', text.strip().lower())


def next_color(used_count: int) -> str:
    return COLOR_PALETTE[used_count % len(COLOR_PALETTE)]


def resolve_status(conn: Connection, raw_label: str | None) -> str:
    label = (raw_label or '').strip()
    if not label:
        row = conn.execute(select(statuses.c.key).order_by(statuses.c.position)).first()
        return row.key

    found = conn.execute(
        select(statuses.c.key).where((func.lower(statuses.c.label) == label.lower()) | (statuses.c.key == slug(label)))
    ).first()
    if found:
        return found.key

    count = conn.execute(select(func.count()).select_from(statuses)).scalar_one()
    max_pos = conn.execute(select(func.coalesce(func.max(statuses.c.position), -1))).scalar_one()
    key = slug(label) or gen_id()
    color = next_color(count)
    conn.execute(insert(statuses).values(key=key, label=label, color=color, position=max_pos + 1))
    return key


def resolve_tag(conn: Connection, raw_label: str | None) -> str | None:
    label = (raw_label or '').strip()
    if not label:
        return None

    found = conn.execute(
        select(tags.c.key).where((func.lower(tags.c.label) == label.lower()) | (tags.c.key == slug(label)))
    ).first()
    if found:
        return found.key

    count = conn.execute(select(func.count()).select_from(tags)).scalar_one()
    key = slug(label) or gen_id()
    bg = next_color(count) + '4d'
    text = next_color(count)
    conn.execute(insert(tags).values(key=key, label=label, bg=bg, text_color=text))
    return key


def task_row_to_dict(row: Row) -> dict:
    return {
        'id': row.id,
        'title': row.title,
        'tag': row.tag_key,
        'due': row.due or '',
        'status': row.status_key,
        'description': row.description or '',
    }


def topic_row_to_dict(row: Row, concepts: list[dict] | None = None) -> dict:
    m = row._mapping
    return {
        'id': m['id'],
        'block_id': m['block_id'],
        'name': m['name'],
        'description': m['description'] or '',
        'metadata': json.loads(m['metadata'] or '{}'),
        'concepts': concepts if concepts is not None else [],
    }


def concept_row_to_dict(row: Row) -> dict:
    m = row._mapping
    return {
        'id': m['id'],
        'topic_id': m['topic_id'],
        'name': m['name'],
        'description': m['description'] or '',
        'metadata': json.loads(m['metadata'] or '{}'),
    }


def block_row_to_dict(row: Row) -> dict:
    m = row._mapping
    return {
        'id': m['id'],
        'name': m['name'],
        'position': m['position'],
    }


def reposition_in_parent(
    conn: Connection,
    table: Table,
    parent_col: Column,
    item_id: str,
    parent_value: str | None,
    index: int,
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
