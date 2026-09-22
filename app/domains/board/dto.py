from dataclasses import dataclass


@dataclass(frozen=True)
class Status:
    key: str
    label: str
    color: str


@dataclass(frozen=True)
class Queue:
    key: str
    label: str
    bg: str
    text: str
    position: int


@dataclass(frozen=True)
class Task:
    id: str
    number: int
    title: str
    queue: str | None
    status: str
    description: str
    priority: str
