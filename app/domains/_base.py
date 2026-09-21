import re
from datetime import date
from typing import Annotated, ClassVar

from sqlalchemy import Date, Integer, Text
from sqlalchemy.orm import DeclarativeBase, declared_attr, mapped_column


class Base(DeclarativeBase):
    """Общий declarative base для ORM-моделей всех доменов - сам генерирует имя таблицы из имени класса."""

    type_annotation_map: ClassVar = {str: Text, int: Integer, date: Date}

    @declared_attr.directive
    def __tablename__(cls) -> str:
        name = re.sub(r'(?<!^)(?=[A-Z])', '_', cls.__name__).lower()
        if name.endswith('y') and name[-2] not in 'aeiou':
            return name[:-1] + 'ies'
        if name.endswith(('s', 'x', 'ch', 'sh')):
            return name + 'es'
        return name + 's'


Id = Annotated[str, mapped_column(primary_key=True)]
