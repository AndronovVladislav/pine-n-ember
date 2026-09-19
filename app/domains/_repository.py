from typing import Protocol, Self

from sqlalchemy import Connection


class Repository(Protocol):
    def __enter__(self) -> Self: ...

    def __exit__(self, *exc_info: object) -> None: ...

    def close(self) -> None: ...


class SqlAlchemyRepository:
    def __init__(self, conn: Connection) -> None:
        self._conn = conn

    def __enter__(self) -> Self:
        return self

    def __exit__(self, *exc_info: object) -> None:
        self.close()

    def close(self) -> None:
        self._conn.close()
