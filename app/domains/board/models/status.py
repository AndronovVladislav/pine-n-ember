from sqlalchemy.orm import Mapped

from app.domains._base import Base, Id


class Status(Base):
    key: Mapped[Id]
    label: Mapped[str]
    color: Mapped[str]
    position: Mapped[int]
