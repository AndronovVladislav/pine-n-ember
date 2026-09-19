import re
from typing import Annotated, ClassVar

from sqlalchemy import Integer, Text
from sqlalchemy.orm import DeclarativeBase, declared_attr, mapped_column


class Base(DeclarativeBase):
    """Общий declarative base для ORM-моделей всех доменов - сам генерирует имя таблицы из имени класса."""

    type_annotation_map: ClassVar = {str: Text, int: Integer}

    @declared_attr.directive
    def __tablename__(cls) -> str:
        name = re.sub(r'(?<!^)(?=[A-Z])', '_', cls.__name__).lower()
        return name + ('es' if name.endswith(('s', 'x', 'ch', 'sh')) else 's')


Id = Annotated[str, mapped_column(primary_key=True)]
