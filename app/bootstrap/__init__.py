from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.bootstrap.api import bootstrap_api
from app.bootstrap.database import bootstrap_database
from app.bootstrap.errors import bootstrap_errors
from app.bootstrap.health import bootstrap_health
from app.bootstrap.logging import bootstrap_logging
from app.bootstrap.static import bootstrap_static


@asynccontextmanager
async def lifespan(app: FastAPI):
    bootstrap_database()
    yield


def build_app() -> FastAPI:
    bootstrap_logging()
    app = FastAPI(title='Мой трекер', lifespan=lifespan)
    bootstrap_errors(app)
    bootstrap_api(app)
    bootstrap_health(app)
    bootstrap_static(app)
    return app
