from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles


def bootstrap_static(app: FastAPI) -> None:
    app.mount('/', StaticFiles(directory='static', html=True), name='static')
