from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.domains._base import Base, Id


class Task(Base):
    id: Mapped[Id]
    title: Mapped[str]
    tag_key: Mapped[str | None] = mapped_column(ForeignKey('tags.key', ondelete='SET NULL'))
    due: Mapped[str | None]
    status_key: Mapped[str] = mapped_column(ForeignKey('statuses.key'))
    description: Mapped[str | None] = mapped_column(server_default='')
    position: Mapped[int] = mapped_column(server_default='0')
