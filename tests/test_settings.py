import pytest
from pydantic import ValidationError

from app.settings import Settings


@pytest.mark.spec('0002')
@pytest.mark.spec('0003')
class TestSettingsDefaults:
    def test_no_env_vars__uses_sensible_defaults(self, monkeypatch):
        """
        Тест проверяет значения настроек по умолчанию, когда ни одна переменная окружения
        TRACKER_* не задана - важно, чтобы приложение можно было запустить локально без .env.
        pytest-env выставляет TRACKER_DATABASE_URL глобально для тестовой сессии (см.
        pyproject.toml), поэтому здесь её нужно явно убрать - иначе тест проверял бы не дефолт
        из кода, а значение, подставленное тестовым окружением.

        Ожидание: DATABASE_URL указывает на локальный Postgres из docker-compose,
        LOG_FORMAT="console" (удобно для локальной разработки), LOG_LEVEL="INFO", HOST/PORT -
        стандартные для локального запуска
        """
        monkeypatch.delenv('TRACKER_DATABASE_URL', raising=False)
        settings = Settings(_env_file=None)

        assert settings.DATABASE_URL == 'postgresql+psycopg://tracker:tracker@localhost:5431/tracker'
        assert settings.LOG_LEVEL == 'INFO'
        assert settings.LOG_FORMAT == 'console'
        assert settings.HOST == '0.0.0.0'
        assert settings.PORT == 8000

    def test_invalid_port__raises_validation_error_at_construction(self):
        """
        Тест проверяет, что невалидное значение порта (не число) роняет создание Settings сразу,
        а не где-то в рантайме при первом обращении - это и есть "fail fast на старте".

        Ожидание: Settings(PORT="not-a-number") бросает pydantic ValidationError
        """
        with pytest.raises(ValidationError):
            Settings(_env_file=None, PORT='not-a-number')

    def test_invalid_log_format__raises_validation_error(self):
        """
        Тест проверяет, что LOG_FORMAT ограничен конкретными значениями (console/json), а не
        произвольной строкой - опечатка в env-переменной должна быть замечена сразу.

        Ожидание: Settings(LOG_FORMAT="yaml") бросает pydantic ValidationError
        """
        with pytest.raises(ValidationError):
            Settings(_env_file=None, LOG_FORMAT='yaml')
