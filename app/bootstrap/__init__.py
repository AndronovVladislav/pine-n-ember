from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.responses import Response
from starlette.types import Scope

from app.api import router
from app.bootstrap.database import bootstrap_database
from app.errors import unhandled_exception_handler
from app.health import router as health_router
from app.logging_config import configure_logging
from app.settings import settings

FRONTEND_DIST = Path(__file__).resolve().parents[2] / 'frontend' / 'dist'


class FrontendFiles(StaticFiles):
    async def get_response(self, path: str, scope: Scope) -> Response:
        response = await super().get_response(path, scope)

        if response.headers.get('content-type', '').startswith('text/html'):
            response.headers['cache-control'] = 'no-cache'
        elif path.startswith('assets/') and response.status_code == 200:
            response.headers['cache-control'] = 'public, max-age=31536000, immutable'

        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not (FRONTEND_DIST / 'index.html').is_file():
        raise RuntimeError('Frontend build is missing; run npm ci and npm run build in frontend/')

    bootstrap_database()
    yield


def build_app() -> FastAPI:
    configure_logging(settings.LOG_LEVEL, settings.LOG_FORMAT)
    app = FastAPI(title='Мой трекер', lifespan=lifespan)
    app.add_exception_handler(Exception, unhandled_exception_handler)
    app.include_router(router)
    app.include_router(health_router)
    app.mount('/', FrontendFiles(directory=FRONTEND_DIST, html=True, check_dir=False), name='static')
    return app
