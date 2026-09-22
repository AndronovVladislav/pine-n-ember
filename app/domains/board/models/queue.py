from sqlalchemy.orm import Mapped

from app.domains._base import Base, Id


class Queue(Base):
    key: Mapped[Id]
    label: Mapped[str]
    bg: Mapped[str]
    text_color: Mapped[str]
