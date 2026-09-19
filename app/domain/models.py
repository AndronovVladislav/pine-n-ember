from dataclasses import dataclass, field


@dataclass(frozen=True)
class Status:
    key: str
    label: str
    color: str


@dataclass(frozen=True)
class Tag:
    key: str
    label: str
    bg: str
    text: str


@dataclass(frozen=True)
class Task:
    id: str
    title: str
    tag: str | None
    due: str
    status: str
    description: str


@dataclass(frozen=True)
class Block:
    id: str
    name: str
    position: int


@dataclass(frozen=True)
class Concept:
    id: str
    topic_id: str
    name: str
    description: str


@dataclass(frozen=True)
class Topic:
    id: str
    block_id: str | None
    name: str
    description: str
    concepts: list[Concept] = field(default_factory=list)


@dataclass(frozen=True)
class BlockWithTopics:
    block: Block
    topics: list[Topic]


@dataclass(frozen=True)
class KnowledgeView:
    blocks: list[BlockWithTopics]
    topics: list[Topic]
