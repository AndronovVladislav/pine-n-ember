from fastapi import APIRouter, HTTPException

from app.db import get_connection
from app.domains.board import BoardRepository, SqlAlchemyBoardRepository
from app.errors import handle_domain_errors
from app.schemas import StatusReorder, TaskCreate, TaskMove, TaskOut, TaskUpdate

router = APIRouter()


def _board_repo() -> BoardRepository:
    return SqlAlchemyBoardRepository(get_connection())


@router.get('/board')
def get_board() -> dict:
    with _board_repo() as repo:
        status_list, tag_list, task_list = repo.list_board()
        return {
            'statuses': [{'key': status.key, 'label': status.label, 'color': status.color} for status in status_list],
            'tags': [{'key': tag.key, 'label': tag.label, 'bg': tag.bg, 'text': tag.text} for tag in tag_list],
            'tasks': [TaskOut.model_validate(task).model_dump() for task in task_list],
        }


@router.post('/tasks')
def create_task(payload: TaskCreate) -> TaskOut:
    title = payload.title.strip()
    if not title:
        raise HTTPException(400, 'title is required')
    with _board_repo() as repo:
        return repo.create_task(title, payload.tag, payload.due, payload.status)


@router.patch('/tasks/{task_id}')
@handle_domain_errors
def update_task(task_id: str, payload: TaskUpdate) -> TaskOut:
    with _board_repo() as repo:
        return repo.update_task(
            task_id,
            title=payload.title,
            tag_label=payload.tag,
            status_label=payload.status,
            due=payload.due,
            description=payload.description,
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
