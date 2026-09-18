import json
import logging
from logging.config import dictConfig
from typing import Literal


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            'timestamp': self.formatTime(record, '%Y-%m-%dT%H:%M:%S%z'),
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
        }
        if record.exc_info:
            payload['exception'] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def configure_logging(level: str, log_format: Literal['console', 'json']) -> None:
    formatter = (
        {'()': JsonFormatter} if log_format == 'json' else {'format': '%(asctime)s %(levelname)s %(name)s: %(message)s'}
    )
    dictConfig(
        {
            'version': 1,
            'disable_existing_loggers': False,
            'formatters': {'default': formatter},
            'handlers': {
                'console': {
                    'class': 'logging.StreamHandler',
                    'formatter': 'default',
                }
            },
            'root': {'level': level, 'handlers': ['console']},
        }
    )
