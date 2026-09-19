from pydantic import BaseModel, ConfigDict


class StatusOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    key: str
    label: str
    color: str


class StatusReorder(BaseModel):
    keys: list[str]


class TagOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    key: str
    label: str
    bg: str
    text: str


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

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
    model_config = ConfigDict(from_attributes=True)

    id: str
    topic_id: str
    name: str
    description: str


class ConceptCreate(BaseModel):
    name: str
    description: str = ''


class ConceptUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    topic_id: str | None = None
    position: int | None = None


class TopicOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    block_id: str | None
    name: str
    description: str
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
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    position: int


class BlockCreate(BaseModel):
    name: str


class BlockUpdate(BaseModel):
    name: str | None = None


class BlockReorder(BaseModel):
    keys: list[str]
