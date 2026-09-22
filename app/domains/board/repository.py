from sqlalchemy import delete, func, insert, select, update

from app.domains._repository import SqlAlchemyRepository
from app.domains.board import models
from app.domains.board.dto import Queue, Status, Task
from app.domains.errors import InvalidOperation, NotFound
from app.domains.ids import gen_id, next_color, slug


def _task_from_row(row) -> Task:
    return Task(
        id=row.id,
        number=row.number,
        title=row.title,
        queue=row.queue_key,
        status=row.status_key,
        description=row.description or '',
        priority=row.priority,
    )


class SqlAlchemyBoardRepository(SqlAlchemyRepository):
    def _resolve_status(self, raw_label: str | None) -> str:
        conn = self._conn
        label = (raw_label or '').strip()
        if not label:
            row = conn.execute(select(models.Status.key).order_by(models.Status.position)).first()
            if row:
                return row.key
            # ponytail: первый статус на пустой доске, явной метки не дали
            label = 'Backlog'

        found = conn.execute(
            select(models.Status.key).where(
                (func.lower(models.Status.label) == label.lower()) | (models.Status.key == slug(label))
            )
        ).first()
        if found:
            return found.key

        count = conn.execute(select(func.count()).select_from(models.Status)).scalar_one()
        max_pos = conn.execute(select(func.coalesce(func.max(models.Status.position), -1))).scalar_one()
        key = slug(label) or gen_id()
        color = next_color(count)
        conn.execute(insert(models.Status).values(key=key, label=label, color=color, position=max_pos + 1))
        return key

    def _resolve_queue(self, raw_label: str | None) -> str | None:
        conn = self._conn
        label = (raw_label or '').strip()
        if not label:
            return None

        found = conn.execute(
            select(models.Queue.key).where(
                (func.lower(models.Queue.label) == label.lower()) | (models.Queue.key == slug(label))
            )
        ).first()
        if found:
            return found.key

        count = conn.execute(select(func.count()).select_from(models.Queue)).scalar_one()
        key = slug(label) or gen_id()
        bg = next_color(count) + '4d'
        text = next_color(count)
        conn.execute(insert(models.Queue).values(key=key, label=label.upper(), bg=bg, text_color=text))
        return key

    def list_board(self) -> tuple[list[Status], list[Queue], list[Task]]:
        conn = self._conn
        status_list = [
            Status(key=row.key, label=row.label, color=row.color)
            for row in conn.execute(select(models.Status).order_by(models.Status.position))
        ]
        queue_list = [
            Queue(key=row.key, label=row.label, bg=row.bg, text=row.text_color)
            for row in conn.execute(select(models.Queue))
        ]
        task_list = [_task_from_row(row) for row in conn.execute(select(models.Task).order_by(models.Task.position))]
        return status_list, queue_list, task_list

    def create_task(
        self, title: str, queue_label: str | None, status_label: str | None, priority: str | None = None
    ) -> Task:
        conn = self._conn
        queue_key = self._resolve_queue(queue_label)
        status_key = self._resolve_status(status_label)
        task_id = gen_id()
        max_pos = conn.execute(
            select(func.coalesce(func.max(models.Task.position), -1)).where(models.Task.status_key == status_key)
        ).scalar_one()
        conn.execute(
            insert(models.Task).values(
                id=task_id,
                title=title,
                queue_key=queue_key,
                status_key=status_key,
                description='',
                position=max_pos + 1,
                priority=priority or 'low',
            )
        )
        conn.commit()
        row = conn.execute(select(models.Task).where(models.Task.id == task_id)).one()
        return _task_from_row(row)

    def update_task(
        self,
        task_id: str,
        *,
        title: str | None = None,
        queue_label: str | None = None,
        status_label: str | None = None,
        description: str | None = None,
        priority: str | None = None,
    ) -> Task:
        conn = self._conn
        row = conn.execute(select(models.Task).where(models.Task.id == task_id)).first()
        if not row:
            raise NotFound(f'task {task_id!r} not found')

        new_title = row.title
        if title is not None:
            new_title = title.strip() or row.title

        queue_key = row.queue_key
        if queue_label is not None:
            queue_key = self._resolve_queue(queue_label)

        status_key = row.status_key
        if status_label is not None:
            status_key = self._resolve_status(status_label)

        new_description = row.description
        if description is not None:
            new_description = description

        new_priority = row.priority
        if priority is not None:
            new_priority = priority

        conn.execute(
            update(models.Task)
            .where(models.Task.id == task_id)
            .values(
                title=new_title,
                queue_key=queue_key,
                status_key=status_key,
                description=new_description,
                priority=new_priority,
            )
        )
        conn.commit()
        row = conn.execute(select(models.Task).where(models.Task.id == task_id)).one()
        return _task_from_row(row)

    def move_task(self, task_id: str, status_key: str) -> Task:
        conn = self._conn
        row = conn.execute(select(models.Task).where(models.Task.id == task_id)).first()
        if not row:
            raise NotFound(f'task {task_id!r} not found')
        status = conn.execute(select(models.Status.key).where(models.Status.key == status_key)).first()
        if not status:
            raise InvalidOperation('unknown status')
        max_pos = conn.execute(
            select(func.coalesce(func.max(models.Task.position), -1)).where(models.Task.status_key == status_key)
        ).scalar_one()
        conn.execute(
            update(models.Task).where(models.Task.id == task_id).values(status_key=status_key, position=max_pos + 1)
        )
        conn.commit()
        row = conn.execute(select(models.Task).where(models.Task.id == task_id)).one()
        return _task_from_row(row)

    def delete_task(self, task_id: str) -> None:
        self._conn.execute(delete(models.Task).where(models.Task.id == task_id))
        self._conn.commit()

    def reorder_statuses(self, keys: list[str]) -> None:
        conn = self._conn
        existing = {row.key for row in conn.execute(select(models.Status.key))}
        if set(keys) != existing:
            raise InvalidOperation('keys must match existing statuses exactly')
        for position, key in enumerate(keys):
            conn.execute(update(models.Status).where(models.Status.key == key).values(position=position))
        conn.commit()

    def delete_status(self, status_key: str) -> None:
        conn = self._conn
        count = conn.execute(select(func.count()).select_from(models.Status)).scalar_one()
        if count <= 1:
            raise InvalidOperation('cannot delete the last status')
        conn.execute(delete(models.Task).where(models.Task.status_key == status_key))
        conn.execute(delete(models.Status).where(models.Status.key == status_key))
        conn.commit()

    def rename_status(self, status_key: str, label: str) -> Status:
        conn = self._conn
        label = label.strip()
        if not label:
            raise InvalidOperation('label is required')
        row = conn.execute(select(models.Status).where(models.Status.key == status_key)).first()
        if not row:
            raise NotFound(f'status {status_key!r} not found')
        duplicate = conn.execute(
            select(models.Status.key).where(
                func.lower(models.Status.label) == label.lower(), models.Status.key != status_key
            )
        ).first()
        if duplicate:
            raise InvalidOperation(f'status with label {label!r} already exists')
        conn.execute(update(models.Status).where(models.Status.key == status_key).values(label=label))
        conn.commit()
        return Status(key=row.key, label=label, color=row.color)
