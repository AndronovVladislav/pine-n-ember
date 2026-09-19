from typing import Protocol

from app.domain.models import Block, Concept, KnowledgeView, Status, Tag, Task, Topic

# Сентинел "аргумент не передан", отличимый от None - нужен для полей, где None - валидное
# значение (например block_id=None означает "разгруппировать тему").
UNSET = object()


class BoardRepository(Protocol):
    def close(self) -> None: ...

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


class KnowledgeRepository(Protocol):
    def close(self) -> None: ...

    def get_knowledge(self) -> KnowledgeView: ...

    def create_block(self, name: str) -> Block: ...

    def update_block(self, block_id: str, name: str | None) -> Block:
        """Бросает NotFound, если блока нет."""
        ...

    def reorder_blocks(self, keys: list[str]) -> None:
        """Бросает InvalidOperation, если набор ключей не совпадает с текущими блоками."""
        ...

    def delete_block(self, block_id: str) -> None: ...

    def create_topic(self, name: str, description: str, block_id: str | None) -> Topic: ...

    def update_topic(
        self,
        topic_id: str,
        *,
        name: str | None = None,
        description: str | None = None,
        block_id: str | object = UNSET,
        position: int | None = None,
    ) -> Topic:
        """Бросает NotFound, если темы нет."""
        ...

    def delete_topic(self, topic_id: str) -> None: ...

    def create_concept(self, topic_id: str, name: str, description: str) -> Concept:
        """Бросает NotFound, если темы нет."""
        ...

    def update_concept(
        self,
        concept_id: str,
        *,
        name: str | None = None,
        description: str | None = None,
        topic_id: str | object = UNSET,
        position: int | None = None,
    ) -> Concept:
        """Бросает NotFound, если понятия или целевой темы нет."""
        ...

    def delete_concept(self, concept_id: str) -> None: ...
