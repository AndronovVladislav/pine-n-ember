from sqlalchemy.orm import Mapped, mapped_column

from app.domains._base import Base, Id


class Block(Base):
    id: Mapped[Id]
    name: Mapped[str]
    position: Mapped[int] = mapped_column(server_default='0')
