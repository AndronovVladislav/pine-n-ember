from fastapi import FastAPI

from app.health import router as health_router


def bootstrap_health(app: FastAPI) -> None:
    app.include_router(health_router)
