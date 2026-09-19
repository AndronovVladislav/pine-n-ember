from sqlalchemy import delete, func, insert, select, update

from app.domains._repository import SqlAlchemyRepository
from app.domains.board import models
from app.domains.board.dto import Status, Tag, Task
from app.domains.errors import InvalidOperation, NotFound
from app.domains.ids import gen_id, next_color, slug


def _task_from_row(row) -> Task:
    return Task(
        id=row.id,
        title=row.title,
        tag=row.tag_key,
        due=row.due or '',
        status=row.status_key,
        description=row.description or '',
    )


class SqlAlchemyBoardRepository(SqlAlchemyRepository):
    def _resolve_status(self, raw_label: str | None) -> str:
        conn = self._conn
        label = (raw_label or '').strip()
        if not label:
            row = conn.execute(select(models.Status.key).order_by(models.Status.position)).first()
            if row:
                return row.key
            label = 'Backlog'  # ponytail: первый статус на пустой доске, явной метки не дали

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

    def _resolve_tag(self, raw_label: str | None) -> str | None:
        conn = self._conn
        label = (raw_label or '').strip()
        if not label:
            return None

        found = conn.execute(
            select(models.Tag.key).where(
                (func.lower(models.Tag.label) == label.lower()) | (models.Tag.key == slug(label))
            )
        ).first()
        if found:
            return found.key

        count = conn.execute(select(func.count()).select_from(models.Tag)).scalar_one()
        key = slug(label) or gen_id()
        bg = next_color(count) + '4d'
        text = next_color(count)
        conn.execute(insert(models.Tag).values(key=key, label=label, bg=bg, text_color=text))
        return key

    def list_board(self) -> tuple[list[Status], list[Tag], list[Task]]:
        conn = self._conn
        status_list = [
            Status(key=r.key, label=r.label, color=r.color)
            for r in conn.execute(select(models.Status).order_by(models.Status.position))
        ]
        tag_list = [Tag(key=r.key, label=r.label, bg=r.bg, text=r.text_color) for r in conn.execute(select(models.Tag))]
        task_list = [_task_from_row(r) for r in conn.execute(select(models.Task).order_by(models.Task.position))]
        return status_list, tag_list, task_list

    def create_task(self, title: str, tag_label: str | None, due: str, status_label: str | None) -> Task:
        conn = self._conn
        tag_key = self._resolve_tag(tag_label)
        status_key = self._resolve_status(status_label)
        task_id = gen_id()
        max_pos = conn.execute(
            select(func.coalesce(func.max(models.Task.position), -1)).where(models.Task.status_key == status_key)
        ).scalar_one()
        conn.execute(
            insert(models.Task).values(
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
        row = conn.execute(select(models.Task).where(models.Task.id == task_id)).one()
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
        row = conn.execute(select(models.Task).where(models.Task.id == task_id)).first()
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
            update(models.Task)
            .where(models.Task.id == task_id)
            .values(title=new_title, tag_key=tag_key, due=new_due, status_key=status_key, description=new_description)
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
        existing = {r.key for r in conn.execute(select(models.Status.key))}
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
