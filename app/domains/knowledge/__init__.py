from app.domains.knowledge.ports import KnowledgeRepository
from app.domains.knowledge.repository import SqlAlchemyKnowledgeRepository

__all__ = ['KnowledgeRepository', 'SqlAlchemyKnowledgeRepository']
