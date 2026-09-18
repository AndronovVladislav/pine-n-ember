from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix='TRACKER_', env_file='.env', extra='ignore')

    DATABASE_URL: str = 'postgresql+psycopg://tracker:tracker@localhost:5431/tracker'
    LOG_LEVEL: str = 'INFO'
    LOG_FORMAT: Literal['console', 'json'] = 'console'
    HOST: str = '0.0.0.0'
    PORT: int = 8000


settings = Settings()
