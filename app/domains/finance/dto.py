from dataclasses import dataclass
from datetime import date
from decimal import Decimal


@dataclass(frozen=True)
class Category:
    id: str
    kind: str
    name: str


@dataclass(frozen=True)
class Operation:
    id: str
    kind: str
    category_id: str
    amount: Decimal
    currency: str
    amount_rub: Decimal
    rate: Decimal
    date: date


@dataclass(frozen=True)
class CategoryBreakdown:
    category_id: str
    category_name: str
    amount_rub: Decimal


@dataclass(frozen=True)
class BalancePoint:
    date: date
    cumulative_rub: Decimal


@dataclass(frozen=True)
class RecentOperation:
    id: str
    kind: str
    category_name: str
    amount: Decimal
    currency: str
    amount_rub: Decimal
    date: date


@dataclass(frozen=True)
class FinanceDashboard:
    income_total_rub: Decimal
    expense_total_rub: Decimal
    balance_rub: Decimal
    expense_by_category: list[CategoryBreakdown]
    income_by_category: list[CategoryBreakdown]
    balance_series: list[BalancePoint]
    recent_operations: list[RecentOperation]
