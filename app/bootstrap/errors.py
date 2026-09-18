from fastapi import FastAPI

from app.errors import unhandled_exception_handler


def bootstrap_errors(app: FastAPI) -> None:
    app.add_exception_handler(Exception, unhandled_exception_handler)
