from sqlalchemy import Connection, delete, func, insert, select, update

from app.domain.errors import InvalidOperation, NotFound
from app.domain.ids import gen_id, next_color, slug
from app.domain.models import Status, Tag, Task
from app.tables import statuses, tags, tasks


def _task_from_row(row) -> Task:
    return Task(
        id=row.id,
        title=row.title,
        tag=row.tag_key,
        due=row.due or '',
        status=row.status_key,
        description=row.description or '',
    )


class SqlAlchemyBoardRepository:
    def __init__(self, conn: Connection) -> None:
        self._conn = conn

    def close(self) -> None:
        self._conn.close()

    def _resolve_status(self, raw_label: str | None) -> str:
        conn = self._conn
        label = (raw_label or '').strip()
        if not label:
            row = conn.execute(select(statuses.c.key).order_by(statuses.c.position)).first()
            return row.key

        found = conn.execute(
            select(statuses.c.key).where(
                (func.lower(statuses.c.label) == label.lower()) | (statuses.c.key == slug(label))
            )
        ).first()
        if found:
            return found.key

        count = conn.execute(select(func.count()).select_from(statuses)).scalar_one()
        max_pos = conn.execute(select(func.coalesce(func.max(statuses.c.position), -1))).scalar_one()
        key = slug(label) or gen_id()
        color = next_color(count)
        conn.execute(insert(statuses).values(key=key, label=label, color=color, position=max_pos + 1))
        return key

    def _resolve_tag(self, raw_label: str | None) -> str | None:
        conn = self._conn
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

    def list_board(self) -> tuple[list[Status], list[Tag], list[Task]]:
        conn = self._conn
        status_list = [
            Status(key=r.key, label=r.label, color=r.color)
            for r in conn.execute(select(statuses).order_by(statuses.c.position))
        ]
        tag_list = [Tag(key=r.key, label=r.label, bg=r.bg, text=r.text_color) for r in conn.execute(select(tags))]
        task_list = [_task_from_row(r) for r in conn.execute(select(tasks).order_by(tasks.c.position))]
        return status_list, tag_list, task_list

    def create_task(self, title: str, tag_label: str | None, due: str, status_label: str | None) -> Task:
        conn = self._conn
        tag_key = self._resolve_tag(tag_label)
        status_key = self._resolve_status(status_label)
        task_id = gen_id()
        max_pos = conn.execute(
            select(func.coalesce(func.max(tasks.c.position), -1)).where(tasks.c.status_key == status_key)
        ).scalar_one()
        conn.execute(
            insert(tasks).values(
                id=task_id,
                title=title,
                tag_key=tag_key,
                due=due.strip(),
                status_key=status_key,
                description='',
                position=max_pos + 1,
            )
        )
        conn.commit()
        row = conn.execute(select(tasks).where(tasks.c.id == task_id)).one()
        return _task_from_row(row)

    def update_task(
        self,
        task_id: str,
        *,
        title=None,
        tag_label=None,
        status_label=None,
        due=None,
        description=None,
    ) -> Task:
        conn = self._conn
        row = conn.execute(select(tasks).where(tasks.c.id == task_id)).first()
        if not row:
            raise NotFound(f'task {task_id!r} not found')

        new_title = row.title
        if title is not None:
            new_title = title.strip() or row.title

        tag_key = row.tag_key
        if tag_label is not None:
            tag_key = self._resolve_tag(tag_label)

        status_key = row.status_key
        if status_label is not None:
            status_key = self._resolve_status(status_label)

        new_due = row.due
        if due is not None:
            new_due = due.strip()

        new_description = row.description
        if description is not None:
            new_description = description

        conn.execute(
            update(tasks)
            .where(tasks.c.id == task_id)
            .values(title=new_title, tag_key=tag_key, due=new_due, status_key=status_key, description=new_description)
        )
        conn.commit()
        row = conn.execute(select(tasks).where(tasks.c.id == task_id)).one()
        return _task_from_row(row)

    def move_task(self, task_id: str, status_key: str) -> Task:
        conn = self._conn
        row = conn.execute(select(tasks).where(tasks.c.id == task_id)).first()
        if not row:
            raise NotFound(f'task {task_id!r} not found')
        status = conn.execute(select(statuses.c.key).where(statuses.c.key == status_key)).first()
        if not status:
            raise InvalidOperation('unknown status')
        max_pos = conn.execute(
            select(func.coalesce(func.max(tasks.c.position), -1)).where(tasks.c.status_key == status_key)
        ).scalar_one()
        conn.execute(update(tasks).where(tasks.c.id == task_id).values(status_key=status_key, position=max_pos + 1))
        conn.commit()
        row = conn.execute(select(tasks).where(tasks.c.id == task_id)).one()
        return _task_from_row(row)

    def delete_task(self, task_id: str) -> None:
        self._conn.execute(delete(tasks).where(tasks.c.id == task_id))
        self._conn.commit()

    def reorder_statuses(self, keys: list[str]) -> None:
        conn = self._conn
        existing = {r.key for r in conn.execute(select(statuses.c.key))}
        if set(keys) != existing:
            raise InvalidOperation('keys must match existing statuses exactly')
        for position, key in enumerate(keys):
            conn.execute(update(statuses).where(statuses.c.key == key).values(position=position))
        conn.commit()

    def delete_status(self, status_key: str) -> None:
        conn = self._conn
        count = conn.execute(select(func.count()).select_from(statuses)).scalar_one()
        if count <= 1:
            raise InvalidOperation('cannot delete the last status')
        conn.execute(delete(tasks).where(tasks.c.status_key == status_key))
        conn.execute(delete(statuses).where(statuses.c.key == status_key))
        conn.commit()
