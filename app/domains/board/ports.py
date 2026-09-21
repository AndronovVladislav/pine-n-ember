from typing import Protocol

from app.domains._repository import Repository
from app.domains.board.dto import Status, Tag, Task


class BoardRepository(Repository, Protocol):
    def list_board(self) -> tuple[list[Status], list[Tag], list[Task]]: ...

    def create_task(self, title: str, tag_label: str | None, due: str, status_label: str | None) -> Task: ...

    def update_task(
        self,
        task_id: str,
        *,
        title: str | None = None,
        tag_label: str | None = None,
        status_label: str | None = None,
        due: str | None = None,
        description: str | None = None,
    ) -> Task:
        """Бросает NotFound, если задачи нет."""
        ...

    def move_task(self, task_id: str, status_key: str) -> Task:
        """Бросает NotFound, если задачи нет; InvalidOperation, если статус неизвестен."""
        ...

    def delete_task(self, task_id: str) -> None: ...

    def reorder_statuses(self, keys: list[str]) -> None:
        """Бросает InvalidOperation, если набор ключей не совпадает с текущими статусами."""
        ...

    def delete_status(self, status_key: str) -> None:
        """Бросает InvalidOperation, если это последний статус."""
        ...

    def rename_status(self, status_key: str, label: str) -> Status:
        """Бросает NotFound, если статуса нет; InvalidOperation, если label пустой."""
        ...
