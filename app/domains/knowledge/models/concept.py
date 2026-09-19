from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.domains._base import Base, Id


class Concept(Base):
    id: Mapped[Id]
    topic_id: Mapped[str] = mapped_column(ForeignKey('topics.id', ondelete='CASCADE'))
    name: Mapped[str]
    description: Mapped[str | None] = mapped_column(server_default='')
    position: Mapped[int] = mapped_column(server_default='0')
