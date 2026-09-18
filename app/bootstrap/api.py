from fastapi import FastAPI

from app.api import router


def bootstrap_api(app: FastAPI) -> None:
    app.include_router(router)
