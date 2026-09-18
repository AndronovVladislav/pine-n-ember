from pydantic import BaseModel


class StatusOut(BaseModel):
    key: str
    label: str
    color: str


class StatusReorder(BaseModel):
    keys: list[str]


class TagOut(BaseModel):
    key: str
    label: str
    bg: str
    text: str


class TaskOut(BaseModel):
    id: str
    title: str
    tag: str | None
    due: str
    status: str
    description: str


class TaskCreate(BaseModel):
    title: str
    tag: str | None = None
    due: str = ''
    status: str | None = None


class TaskUpdate(BaseModel):
    title: str | None = None
    tag: str | None = None
    due: str | None = None
    status: str | None = None
    description: str | None = None


class TaskMove(BaseModel):
    status: str


class ConceptOut(BaseModel):
    id: str
    topic_id: str
    name: str
    description: str
    metadata: dict


class ConceptCreate(BaseModel):
    name: str
    description: str = ''


class ConceptUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    topic_id: str | None = None
    position: int | None = None


class TopicOut(BaseModel):
    id: str
    block_id: str | None
    name: str
    description: str
    metadata: dict
    concepts: list[ConceptOut] = []


class TopicCreate(BaseModel):
    name: str
    description: str = ''
    block_id: str | None = None


class TopicUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    block_id: str | None = None
    position: int | None = None


class BlockOut(BaseModel):
    id: str
    name: str
    position: int


class BlockCreate(BaseModel):
    name: str


class BlockUpdate(BaseModel):
    name: str | None = None


class BlockReorder(BaseModel):
    keys: list[str]
