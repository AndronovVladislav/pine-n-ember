from dataclasses import dataclass


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
