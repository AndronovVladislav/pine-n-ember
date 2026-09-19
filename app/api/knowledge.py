from fastapi import APIRouter, HTTPException

from app.db import get_connection
from app.domains.knowledge import KnowledgeRepository, SqlAlchemyKnowledgeRepository
from app.errors import handle_domain_errors
from app.schemas import (
    BlockCreate,
    BlockOut,
    BlockReorder,
    BlockUpdate,
    ConceptCreate,
    ConceptOut,
    ConceptUpdate,
    TopicCreate,
    TopicOut,
    TopicUpdate,
)

router = APIRouter()


def _knowledge_repo() -> KnowledgeRepository:
    return SqlAlchemyKnowledgeRepository(get_connection())


@router.get('/knowledge')
def get_knowledge() -> dict:
    with _knowledge_repo() as repo:
        view = repo.get_knowledge()
        return {
            'blocks': [
                {
                    **BlockOut.model_validate(bwt.block).model_dump(),
                    'topics': [TopicOut.model_validate(t).model_dump() for t in bwt.topics],
                }
                for bwt in view.blocks
            ],
            'topics': [TopicOut.model_validate(t).model_dump() for t in view.topics],
        }


@router.post('/blocks')
def create_block(payload: BlockCreate) -> BlockOut:
    name = payload.name.strip()
    if not name:
        raise HTTPException(400, 'name is required')
    with _knowledge_repo() as repo:
        return repo.create_block(name)


@router.put('/blocks/reorder')
@handle_domain_errors
def reorder_blocks(payload: BlockReorder) -> dict:
    with _knowledge_repo() as repo:
        repo.reorder_blocks(payload.keys)
        return {'ok': True}


@router.patch('/blocks/{block_id}')
@handle_domain_errors
def update_block(block_id: str, payload: BlockUpdate) -> BlockOut:
    with _knowledge_repo() as repo:
        return repo.update_block(block_id, payload.name)


@router.delete('/blocks/{block_id}', status_code=204)
def delete_block(block_id: str) -> None:
    with _knowledge_repo() as repo:
        repo.delete_block(block_id)


@router.post('/topics')
def create_topic(payload: TopicCreate) -> TopicOut:
    name = payload.name.strip()
    if not name:
        raise HTTPException(400, 'name is required')
    with _knowledge_repo() as repo:
        return repo.create_topic(name, payload.description, payload.block_id)


@router.patch('/topics/{topic_id}')
@handle_domain_errors
def update_topic(topic_id: str, payload: TopicUpdate) -> TopicOut:
    fields_set = payload.model_fields_set
    kwargs = {'name': payload.name, 'description': payload.description, 'position': payload.position}
    if 'block_id' in fields_set:
        kwargs['block_id'] = payload.block_id
    with _knowledge_repo() as repo:
        return repo.update_topic(topic_id, **kwargs)


@router.delete('/topics/{topic_id}', status_code=204)
def delete_topic(topic_id: str) -> None:
    with _knowledge_repo() as repo:
        repo.delete_topic(topic_id)


@router.post('/topics/{topic_id}/concepts')
@handle_domain_errors
def create_concept(topic_id: str, payload: ConceptCreate) -> ConceptOut:
    name = payload.name.strip()
    if not name:
        raise HTTPException(400, 'name is required')
    with _knowledge_repo() as repo:
        return repo.create_concept(topic_id, name, payload.description)


@router.patch('/concepts/{concept_id}')
@handle_domain_errors
def update_concept(concept_id: str, payload: ConceptUpdate) -> ConceptOut:
    fields_set = payload.model_fields_set
    kwargs = {'name': payload.name, 'description': payload.description, 'position': payload.position}
    if 'topic_id' in fields_set:
        kwargs['topic_id'] = payload.topic_id
    with _knowledge_repo() as repo:
        return repo.update_concept(concept_id, **kwargs)


@router.delete('/concepts/{concept_id}', status_code=204)
def delete_concept(concept_id: str) -> None:
    with _knowledge_repo() as repo:
        repo.delete_concept(concept_id)
