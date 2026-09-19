from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.domains._base import Base, Id


class Topic(Base):
    id: Mapped[Id]
    block_id: Mapped[str | None] = mapped_column(ForeignKey('blocks.id', ondelete='SET NULL'))
    name: Mapped[str]
    description: Mapped[str | None] = mapped_column(server_default='')
    position: Mapped[int] = mapped_column(server_default='0')
