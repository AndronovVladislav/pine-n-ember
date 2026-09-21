from datetime import date
from decimal import Decimal

from sqlalchemy import ForeignKey, Numeric
from sqlalchemy.orm import Mapped, mapped_column

from app.domains._base import Base, Id


class Operation(Base):
    """amount/amount_rub хранятся со знаком: + доход, - расход - направление не дублируется отдельной колонкой."""

    id: Mapped[Id]
    category_id: Mapped[str] = mapped_column(ForeignKey('categories.id', ondelete='CASCADE'))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    currency: Mapped[str]
    amount_rub: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    rate: Mapped[Decimal] = mapped_column(Numeric(12, 6))
    date: Mapped[date]
