from sqlalchemy.orm import Mapped

from app.domains._base import Base, Id


class Category(Base):
    id: Mapped[Id]
    kind: Mapped[str]
    name: Mapped[str]
