from datetime import date
from decimal import Decimal

from sqlalchemy import delete, insert, select, update

from app.domains._repository import SqlAlchemyRepository
from app.domains.errors import InvalidOperation, NotFound
from app.domains.finance import exchange_rate, models
from app.domains.finance.dto import (
    BalancePoint,
    Category,
    CategoryBreakdown,
    FinanceDashboard,
    Operation,
    RecentOperation,
)
from app.domains.ids import gen_id

RECENT_OPERATIONS_LIMIT = 10


def _category_from_row(row) -> Category:
    return Category(id=row.id, kind=row.kind, name=row.name)


def _operation_from_row(row) -> Operation:
    kind = 'income' if row.amount >= 0 else 'expense'
    return Operation(
        id=row.id,
        kind=kind,
        category_id=row.category_id,
        amount=abs(row.amount),
        currency=row.currency,
        amount_rub=abs(row.amount_rub),
        rate=row.rate,
        date=row.date,
    )


class SqlAlchemyFinanceRepository(SqlAlchemyRepository):
    def _convert_to_rub(self, amount: Decimal, currency: str, on_date: date) -> tuple[Decimal, Decimal]:
        if currency == 'RUB':
            return amount, Decimal(1)
        rate = exchange_rate.fetch_byn_to_rub_rate(on_date)
        return (amount * rate).quantize(Decimal('0.01')), rate

    def list_categories(self, kind: str) -> list[Category]:
        rows = self._conn.execute(
            select(models.Category).where(models.Category.kind == kind).order_by(models.Category.name)
        )
        return [_category_from_row(row) for row in rows]

    def create_category(self, kind: str, name: str) -> Category:
        conn = self._conn
        category_id = gen_id()
        conn.execute(insert(models.Category).values(id=category_id, kind=kind, name=name))
        conn.commit()
        row = conn.execute(select(models.Category).where(models.Category.id == category_id)).one()
        return _category_from_row(row)

    def update_category(self, category_id: str, name: str | None) -> Category:
        conn = self._conn
        row = conn.execute(select(models.Category).where(models.Category.id == category_id)).first()
        if not row:
            raise NotFound(f'category {category_id!r} not found')

        new_name = row.name
        if name is not None:
            new_name = name.strip() or row.name

        conn.execute(update(models.Category).where(models.Category.id == category_id).values(name=new_name))
        conn.commit()
        row = conn.execute(select(models.Category).where(models.Category.id == category_id)).one()
        return _category_from_row(row)

    def delete_category(self, category_id: str) -> None:
        self._conn.execute(delete(models.Category).where(models.Category.id == category_id))
        self._conn.commit()

    def create_operation(self, kind: str, category_id: str, amount: Decimal, currency: str, on_date: date) -> Operation:
        conn = self._conn
        category = conn.execute(select(models.Category).where(models.Category.id == category_id)).first()
        if not category:
            raise NotFound(f'category {category_id!r} not found')
        if category.kind != kind:
            raise InvalidOperation(f'category {category_id!r} is not a {kind} category')

        amount_rub, rate = self._convert_to_rub(amount, currency, on_date)
        sign = 1 if kind == 'income' else -1

        operation_id = gen_id()
        conn.execute(
            insert(models.Operation).values(
                id=operation_id,
                category_id=category_id,
                amount=sign * amount,
                currency=currency,
                amount_rub=sign * amount_rub,
                rate=rate,
                date=on_date,
            )
        )
        conn.commit()
        row = conn.execute(select(models.Operation).where(models.Operation.id == operation_id)).one()
        return _operation_from_row(row)

    def update_operation(
        self,
        operation_id: str,
        *,
        category_id: str | None = None,
        amount: Decimal | None = None,
        currency: str | None = None,
        on_date: date | None = None,
    ) -> Operation:
        conn = self._conn
        row = conn.execute(select(models.Operation).where(models.Operation.id == operation_id)).first()
        if not row:
            raise NotFound(f'operation {operation_id!r} not found')

        kind = 'income' if row.amount >= 0 else 'expense'
        sign = 1 if kind == 'income' else -1

        new_category_id = row.category_id
        if category_id is not None:
            category = conn.execute(select(models.Category).where(models.Category.id == category_id)).first()
            if not category:
                raise NotFound(f'category {category_id!r} not found')
            if category.kind != kind:
                raise InvalidOperation(f'category {category_id!r} is not a {kind} category')
            new_category_id = category_id

        new_date = on_date if on_date is not None else row.date
        new_amount = amount if amount is not None else abs(row.amount)

        if currency is not None and currency != row.currency:
            new_amount_rub, new_rate = self._convert_to_rub(new_amount, currency, new_date)
            new_currency = currency
        else:
            new_currency = row.currency
            new_rate = row.rate
            new_amount_rub = (new_amount * new_rate).quantize(Decimal('0.01'))

        conn.execute(
            update(models.Operation)
            .where(models.Operation.id == operation_id)
            .values(
                category_id=new_category_id,
                amount=sign * new_amount,
                currency=new_currency,
                amount_rub=sign * new_amount_rub,
                rate=new_rate,
                date=new_date,
            )
        )
        conn.commit()
        row = conn.execute(select(models.Operation).where(models.Operation.id == operation_id)).one()
        return _operation_from_row(row)

    def delete_operation(self, operation_id: str) -> None:
        self._conn.execute(delete(models.Operation).where(models.Operation.id == operation_id))
        self._conn.commit()

    def get_dashboard(self, date_from: date, date_to: date) -> FinanceDashboard:
        conn = self._conn
        rows = conn.execute(
            select(
                models.Operation.id,
                models.Operation.amount,
                models.Operation.currency,
                models.Operation.amount_rub,
                models.Operation.date,
                models.Category.id.label('category_id'),
                models.Category.name.label('category_name'),
            )
            .join(models.Category, models.Operation.category_id == models.Category.id)
            .where(models.Operation.date >= date_from, models.Operation.date <= date_to)
        ).all()

        income_total = Decimal(0)
        expense_total = Decimal(0)
        expense_by_category: dict[str, list] = {}
        income_by_category: dict[str, list] = {}
        daily_net: dict[date, Decimal] = {}

        for row in rows:
            daily_net[row.date] = daily_net.get(row.date, Decimal(0)) + row.amount_rub
            bucket = income_by_category if row.amount_rub >= 0 else expense_by_category
            if row.category_id not in bucket:
                bucket[row.category_id] = [row.category_name, Decimal(0)]
            bucket[row.category_id][1] += abs(row.amount_rub)
            if row.amount_rub >= 0:
                income_total += row.amount_rub
            else:
                expense_total += -row.amount_rub

        cumulative = Decimal(0)
        balance_series = []
        for day in sorted(daily_net):
            cumulative += daily_net[day]
            balance_series.append(BalancePoint(date=day, cumulative_rub=cumulative))

        recent_rows = sorted(rows, key=lambda r: r.date, reverse=True)[:RECENT_OPERATIONS_LIMIT]
        recent_operations = [
            RecentOperation(
                id=r.id,
                kind='income' if r.amount_rub >= 0 else 'expense',
                category_name=r.category_name,
                amount=abs(r.amount),
                currency=r.currency,
                amount_rub=abs(r.amount_rub),
                date=r.date,
            )
            for r in recent_rows
        ]

        return FinanceDashboard(
            income_total_rub=income_total,
            expense_total_rub=expense_total,
            balance_rub=income_total - expense_total,
            expense_by_category=[
                CategoryBreakdown(category_id=cid, category_name=name, amount_rub=amt)
                for cid, (name, amt) in expense_by_category.items()
            ],
            income_by_category=[
                CategoryBreakdown(category_id=cid, category_name=name, amount_rub=amt)
                for cid, (name, amt) in income_by_category.items()
            ],
            balance_series=balance_series,
            recent_operations=recent_operations,
        )
