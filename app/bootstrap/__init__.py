from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.api import router
from app.bootstrap.database import bootstrap_database
from app.errors import unhandled_exception_handler
from app.health import router as health_router
from app.logging_config import configure_logging
from app.settings import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    bootstrap_database()
    yield


def build_app() -> FastAPI:
    configure_logging(settings.LOG_LEVEL, settings.LOG_FORMAT)
    app = FastAPI(title='Мой трекер', lifespan=lifespan)
    app.add_exception_handler(Exception, unhandled_exception_handler)
    app.include_router(router)
    app.include_router(health_router)
    app.mount('/', StaticFiles(directory='static', html=True), name='static')
    return app
