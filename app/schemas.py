import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class StatusOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    key: str
    label: str
    color: str


class StatusReorder(BaseModel):
    keys: list[str]


class StatusRename(BaseModel):
    label: str


class QueueOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    key: str
    label: str
    bg: str
    text: str
    position: int


class QueueReorder(BaseModel):
    keys: list[str]


class QueueRename(BaseModel):
    label: str


TaskPriority = Literal['critical', 'high', 'medium', 'low', 'lowest']


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    number: int
    title: str
    queue: str | None
    status: str
    description: str
    priority: TaskPriority


class TaskCreate(BaseModel):
    title: str
    queue: str | None = None
    status: str | None = None
    priority: TaskPriority | None = None


class TaskUpdate(BaseModel):
    title: str | None = None
    queue: str | None = None
    status: str | None = None
    description: str | None = None
    priority: TaskPriority | None = None


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


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    kind: str
    name: str


class CategoryCreate(BaseModel):
    name: str


class CategoryUpdate(BaseModel):
    name: str | None = None


class OperationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    kind: str
    category_id: str
    amount: Decimal
    currency: str
    amount_rub: Decimal
    rate: Decimal
    date: datetime.date


class ExpenseOperationCreate(BaseModel):
    category_id: str
    amount: Decimal = Field(gt=0)
    currency: Literal['BYN', 'RUB']
    date: datetime.date


class IncomeOperationCreate(BaseModel):
    category_id: str
    amount: Decimal = Field(gt=0)
    currency: Literal['BYN', 'RUB']
    date: datetime.date


class OperationUpdate(BaseModel):
    category_id: str | None = None
    amount: Decimal | None = Field(default=None, gt=0)
    currency: Literal['BYN', 'RUB'] | None = None
    date: datetime.date | None = None


class CategoryBreakdownOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    category_id: str
    category_name: str
    amount_rub: Decimal


class BalancePointOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    date: datetime.date
    cumulative_rub: Decimal


class RecentOperationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    kind: str
    category_name: str
    amount: Decimal
    currency: str
    amount_rub: Decimal
    date: datetime.date


class FinanceDashboardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    income_total_rub: Decimal
    expense_total_rub: Decimal
    balance_rub: Decimal
    expense_by_category: list[CategoryBreakdownOut]
    income_by_category: list[CategoryBreakdownOut]
    balance_series: list[BalancePointOut]
    recent_operations: list[RecentOperationOut]
