import functools
import logging
from collections.abc import Callable
from typing import Any

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

from app.domains.errors import ExternalServiceUnavailable, InvalidOperation, NotFound

logger = logging.getLogger(__name__)


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception('Unhandled exception while processing %s %s', request.method, request.url.path)
    return JSONResponse(status_code=500, content={'detail': 'Internal server error'})


def handle_domain_errors[**P, R](fn: Callable[P, R]) -> Callable[P, R]:
    """Переводит доменные исключения (NotFound/InvalidOperation) в HTTPException на HTTP-границе."""

    @functools.wraps(fn)
    def wrapper(*args: Any, **kwargs: Any) -> R:
        try:
            return fn(*args, **kwargs)
        except (NotFound, InvalidOperation, ExternalServiceUnavailable) as exc:
            match exc:
                case NotFound():
                    raise HTTPException(404, str(exc)) from exc
                case InvalidOperation():
                    raise HTTPException(400, str(exc)) from exc
                case ExternalServiceUnavailable():
                    raise HTTPException(502, str(exc)) from exc

    return wrapper
