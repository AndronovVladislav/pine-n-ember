from fastapi import APIRouter, HTTPException

from app.db import get_connection
from app.domains.board import BoardRepository, SqlAlchemyBoardRepository
from app.errors import handle_domain_errors
from app.schemas import (
    QueueOut,
    QueueRename,
    QueueReorder,
    StatusOut,
    StatusRename,
    StatusReorder,
    TaskCreate,
    TaskMove,
    TaskOut,
    TaskUpdate,
)

router = APIRouter()


def _board_repo() -> BoardRepository:
    return SqlAlchemyBoardRepository(get_connection())


@router.get('/board')
def get_board() -> dict:
    with _board_repo() as repo:
        status_list, queue_list, task_list = repo.list_board()
        return {
            'statuses': [{'key': status.key, 'label': status.label, 'color': status.color} for status in status_list],
            'queues': [
                {'key': q.key, 'label': q.label, 'bg': q.bg, 'text': q.text, 'position': q.position} for q in queue_list
            ],
            'tasks': [TaskOut.model_validate(task).model_dump() for task in task_list],
        }


@router.post('/tasks')
def create_task(payload: TaskCreate) -> TaskOut:
    title = payload.title.strip()
    if not title:
        raise HTTPException(400, 'title is required')
    queue = (payload.queue or '').strip()
    if not queue:
        raise HTTPException(400, 'queue is required')
    with _board_repo() as repo:
        return repo.create_task(title, queue, payload.status, payload.priority)


@router.patch('/tasks/{task_id}')
@handle_domain_errors
def update_task(task_id: str, payload: TaskUpdate) -> TaskOut:
    queue_provided = 'queue' in payload.model_fields_set
    if queue_provided and (payload.queue is None or not payload.queue.strip()):
        raise HTTPException(400, 'queue cannot be unset')
    with _board_repo() as repo:
        return repo.update_task(
            task_id,
            title=payload.title,
            queue_label=payload.queue,
            status_label=payload.status,
            description=payload.description,
            priority=payload.priority,
        )


@router.put('/tasks/{task_id}/move')
@handle_domain_errors
def move_task(task_id: str, payload: TaskMove) -> TaskOut:
    with _board_repo() as repo:
        return repo.move_task(task_id, payload.status)


@router.delete('/tasks/{task_id}', status_code=204)
def delete_task(task_id: str) -> None:
    with _board_repo() as repo:
        repo.delete_task(task_id)


@router.put('/statuses/reorder')
@handle_domain_errors
def reorder_statuses(payload: StatusReorder) -> dict:
    with _board_repo() as repo:
        repo.reorder_statuses(payload.keys)
        return {'ok': True}


@router.delete('/statuses/{status_key}', status_code=204)
@handle_domain_errors
def delete_status(status_key: str) -> None:
    with _board_repo() as repo:
        repo.delete_status(status_key)


@router.patch('/statuses/{status_key}')
@handle_domain_errors
def rename_status(status_key: str, payload: StatusRename) -> StatusOut:
    with _board_repo() as repo:
        return repo.rename_status(status_key, payload.label)


@router.put('/queues/reorder')
@handle_domain_errors
def reorder_queues(payload: QueueReorder) -> dict:
    with _board_repo() as repo:
        repo.reorder_queues(payload.keys)
        return {'ok': True}


@router.patch('/queues/{queue_key}')
@handle_domain_errors
def rename_queue(queue_key: str, payload: QueueRename) -> QueueOut:
    with _board_repo() as repo:
        return repo.rename_queue(queue_key, payload.label)
