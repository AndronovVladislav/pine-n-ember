from typing import Protocol

from app.domains._repository import Repository
from app.domains.board.dto import Queue, Status, Task


class BoardRepository(Repository, Protocol):
    def list_board(self) -> tuple[list[Status], list[Queue], list[Task]]: ...

    def create_task(
        self, title: str, queue_label: str | None, status_label: str | None, priority: str | None = None
    ) -> Task: ...

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

    def reorder_queues(self, keys: list[str]) -> None:
        """Бросает InvalidOperation, если набор ключей не совпадает с текущими очередями."""
        ...

    def rename_queue(self, queue_key: str, label: str) -> Queue:
        """Бросает NotFound, если очереди нет; InvalidOperation, если label пустой или дублирует."""
        ...
