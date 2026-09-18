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


class EntityItemOut(BaseModel):
    id: str
    entity_id: str
    kind: str
    name: str
    description: str
    metadata: dict


class EntityItemCreate(BaseModel):
    name: str
    description: str = ''
    kind: str = 'command'


class EntityItemUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class EntityOut(BaseModel):
    id: str
    kind: str
    name: str
    description: str
    metadata: dict
    items: list[EntityItemOut] = []


class EntityCreate(BaseModel):
    name: str
    description: str = ''
    kind: str = 'skill'


class EntityUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
