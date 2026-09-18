from app.logging_config import configure_logging
from app.settings import settings


def bootstrap_logging() -> None:
    configure_logging(settings.LOG_LEVEL, settings.LOG_FORMAT)
