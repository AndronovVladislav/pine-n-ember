from sqlalchemy import ForeignKey, Identity
from sqlalchemy.orm import Mapped, mapped_column

from app.domains._base import Base, Id


class Task(Base):
    id: Mapped[Id]
    number: Mapped[int] = mapped_column(Identity(), unique=True)
    title: Mapped[str]
    queue_key: Mapped[str | None] = mapped_column(ForeignKey('queues.key', ondelete='SET NULL'))
    status_key: Mapped[str] = mapped_column(ForeignKey('statuses.key'))
    description: Mapped[str | None] = mapped_column(server_default='')
    position: Mapped[int] = mapped_column(server_default='0')
    priority: Mapped[str] = mapped_column(server_default='low')
