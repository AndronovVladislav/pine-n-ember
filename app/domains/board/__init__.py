from app.domains.board.ports import BoardRepository
from app.domains.board.repository import SqlAlchemyBoardRepository

__all__ = ['BoardRepository', 'SqlAlchemyBoardRepository']
