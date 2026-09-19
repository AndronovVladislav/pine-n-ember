from fastapi import APIRouter, HTTPException

from app.adapters.board_repository import SqlAlchemyBoardRepository
from app.adapters.knowledge_repository import SqlAlchemyKnowledgeRepository
from app.db import get_connection
from app.domain.errors import InvalidOperation, NotFound
from app.schemas import (
    BlockCreate,
    BlockOut,
    BlockReorder,
    BlockUpdate,
    ConceptCreate,
    ConceptOut,
    ConceptUpdate,
    StatusReorder,
    TaskCreate,
    TaskMove,
    TaskOut,
    TaskUpdate,
    TopicCreate,
    TopicOut,
    TopicUpdate,
)

router = APIRouter(prefix='/api')


def _board_repo() -> SqlAlchemyBoardRepository:
    return SqlAlchemyBoardRepository(get_connection())


def _knowledge_repo() -> SqlAlchemyKnowledgeRepository:
    return SqlAlchemyKnowledgeRepository(get_connection())


@router.get('/board')
def get_board():
    repo = _board_repo()
    try:
        status_list, tag_list, task_list = repo.list_board()
        return {
            'statuses': [{'key': s.key, 'label': s.label, 'color': s.color} for s in status_list],
            'tags': [{'key': t.key, 'label': t.label, 'bg': t.bg, 'text': t.text} for t in tag_list],
            'tasks': [TaskOut.model_validate(t).model_dump() for t in task_list],
        }
    finally:
        repo.close()


@router.post('/tasks', response_model=TaskOut)
def create_task(payload: TaskCreate):
    repo = _board_repo()
    try:
        title = payload.title.strip()
        if not title:
            raise HTTPException(400, 'title is required')
        return repo.create_task(title, payload.tag, payload.due, payload.status)
    finally:
        repo.close()


@router.patch('/tasks/{task_id}', response_model=TaskOut)
def update_task(task_id: str, payload: TaskUpdate):
    repo = _board_repo()
    try:
        try:
            return repo.update_task(
                task_id,
                title=payload.title,
                tag_label=payload.tag,
                status_label=payload.status,
                due=payload.due,
                description=payload.description,
            )
        except NotFound as exc:
            raise HTTPException(404, str(exc)) from exc
    finally:
        repo.close()


@router.put('/tasks/{task_id}/move', response_model=TaskOut)
def move_task(task_id: str, payload: TaskMove):
    repo = _board_repo()
    try:
        try:
            return repo.move_task(task_id, payload.status)
        except NotFound as exc:
            raise HTTPException(404, str(exc)) from exc
        except InvalidOperation as exc:
            raise HTTPException(400, str(exc)) from exc
    finally:
        repo.close()


@router.delete('/tasks/{task_id}', status_code=204)
def delete_task(task_id: str):
    repo = _board_repo()
    try:
        repo.delete_task(task_id)
    finally:
        repo.close()


@router.put('/statuses/reorder')
def reorder_statuses(payload: StatusReorder):
    repo = _board_repo()
    try:
        try:
            repo.reorder_statuses(payload.keys)
            return {'ok': True}
        except InvalidOperation as exc:
            raise HTTPException(400, str(exc)) from exc
    finally:
        repo.close()


@router.delete('/statuses/{status_key}', status_code=204)
def delete_status(status_key: str):
    repo = _board_repo()
    try:
        try:
            repo.delete_status(status_key)
        except InvalidOperation as exc:
            raise HTTPException(400, str(exc)) from exc
    finally:
        repo.close()


@router.get('/knowledge')
def get_knowledge():
    repo = _knowledge_repo()
    try:
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
    finally:
        repo.close()


@router.post('/blocks', response_model=BlockOut)
def create_block(payload: BlockCreate):
    repo = _knowledge_repo()
    try:
        name = payload.name.strip()
        if not name:
            raise HTTPException(400, 'name is required')
        return repo.create_block(name)
    finally:
        repo.close()


@router.put('/blocks/reorder')
def reorder_blocks(payload: BlockReorder):
    repo = _knowledge_repo()
    try:
        try:
            repo.reorder_blocks(payload.keys)
            return {'ok': True}
        except InvalidOperation as exc:
            raise HTTPException(400, str(exc)) from exc
    finally:
        repo.close()


@router.patch('/blocks/{block_id}', response_model=BlockOut)
def update_block(block_id: str, payload: BlockUpdate):
    repo = _knowledge_repo()
    try:
        try:
            return repo.update_block(block_id, payload.name)
        except NotFound as exc:
            raise HTTPException(404, str(exc)) from exc
    finally:
        repo.close()


@router.delete('/blocks/{block_id}', status_code=204)
def delete_block(block_id: str):
    repo = _knowledge_repo()
    try:
        repo.delete_block(block_id)
    finally:
        repo.close()


@router.post('/topics', response_model=TopicOut)
def create_topic(payload: TopicCreate):
    repo = _knowledge_repo()
    try:
        name = payload.name.strip()
        if not name:
            raise HTTPException(400, 'name is required')
        return repo.create_topic(name, payload.description, payload.block_id)
    finally:
        repo.close()


@router.patch('/topics/{topic_id}', response_model=TopicOut)
def update_topic(topic_id: str, payload: TopicUpdate):
    repo = _knowledge_repo()
    try:
        fields_set = payload.model_fields_set
        kwargs = {'name': payload.name, 'description': payload.description, 'position': payload.position}
        if 'block_id' in fields_set:
            kwargs['block_id'] = payload.block_id
        try:
            return repo.update_topic(topic_id, **kwargs)
        except NotFound as exc:
            raise HTTPException(404, str(exc)) from exc
    finally:
        repo.close()


@router.delete('/topics/{topic_id}', status_code=204)
def delete_topic(topic_id: str):
    repo = _knowledge_repo()
    try:
        repo.delete_topic(topic_id)
    finally:
        repo.close()


@router.post('/topics/{topic_id}/concepts', response_model=ConceptOut)
def create_concept(topic_id: str, payload: ConceptCreate):
    repo = _knowledge_repo()
    try:
        name = payload.name.strip()
        if not name:
            raise HTTPException(400, 'name is required')
        try:
            return repo.create_concept(topic_id, name, payload.description)
        except NotFound as exc:
            raise HTTPException(404, str(exc)) from exc
    finally:
        repo.close()


@router.patch('/concepts/{concept_id}', response_model=ConceptOut)
def update_concept(concept_id: str, payload: ConceptUpdate):
    repo = _knowledge_repo()
    try:
        fields_set = payload.model_fields_set
        kwargs = {'name': payload.name, 'description': payload.description, 'position': payload.position}
        if 'topic_id' in fields_set:
            kwargs['topic_id'] = payload.topic_id
        try:
            return repo.update_concept(concept_id, **kwargs)
        except NotFound as exc:
            raise HTTPException(404, str(exc)) from exc
    finally:
        repo.close()


@router.delete('/concepts/{concept_id}', status_code=204)
def delete_concept(concept_id: str):
    repo = _knowledge_repo()
    try:
        repo.delete_concept(concept_id)
    finally:
        repo.close()
