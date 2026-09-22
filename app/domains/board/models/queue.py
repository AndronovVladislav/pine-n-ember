from sqlalchemy.orm import Mapped, mapped_column

from app.domains._base import Base, Id


class Queue(Base):
    key: Mapped[Id]
    label: Mapped[str]
    bg: Mapped[str]
    text_color: Mapped[str]
    position: Mapped[int] = mapped_column(server_default='0')
