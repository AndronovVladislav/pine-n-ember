from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import select

from app.db import get_connection

router = APIRouter()


@router.get('/healthcheck')
def healthcheck():
    return {'status': 'ok'}


@router.get('/ready')
def ready():
    try:
        conn = get_connection()
        try:
            conn.execute(select(1))
        finally:
            conn.close()
    except Exception:  # noqa: BLE001 - readiness probe must report "not ready" on *any* DB failure
        return JSONResponse(status_code=503, content={'status': 'not_ready'})
    return {'status': 'ready'}
