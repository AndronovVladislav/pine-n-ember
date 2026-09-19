from typing import Protocol

from app.domains._repository import Repository
from app.domains.knowledge.dto import Block, Concept, KnowledgeView, Topic

# Сентинел "аргумент не передан", отличимый от None - нужен для полей, где None - валидное
# значение (например block_id=None означает "разгруппировать тему").
UNSET = object()


class KnowledgeRepository(Repository, Protocol):
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
