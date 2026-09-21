from datetime import date
from decimal import Decimal
from typing import Protocol

from app.domains._repository import Repository
from app.domains.finance.dto import Category, FinanceDashboard, Operation


class FinanceRepository(Repository, Protocol):
    def list_categories(self, kind: str) -> list[Category]: ...

    def create_category(self, kind: str, name: str) -> Category: ...

    def update_category(self, category_id: str, name: str | None) -> Category:
        """Бросает NotFound, если категории нет."""
        ...

    def delete_category(self, category_id: str) -> None: ...

    def create_operation(self, kind: str, category_id: str, amount: Decimal, currency: str, on_date: date) -> Operation:
        """Бросает NotFound, если категории нет; InvalidOperation, если у категории другой kind;
        ExternalServiceUnavailable, если не удалось получить курс BYN->RUB."""
        ...

    def update_operation(
        self,
        operation_id: str,
        *,
        category_id: str | None = None,
        amount: Decimal | None = None,
        currency: str | None = None,
        on_date: date | None = None,
    ) -> Operation:
        """Бросает NotFound, если операции или новой категории нет; InvalidOperation, если новая
        категория другого kind; ExternalServiceUnavailable при смене валюты, если курс недоступен."""
        ...

    def delete_operation(self, operation_id: str) -> None: ...

    def get_dashboard(self, date_from: date, date_to: date) -> FinanceDashboard: ...
