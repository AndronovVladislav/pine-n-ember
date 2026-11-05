import re
from pathlib import Path
from urllib.parse import urlsplit

import pytest
from fastapi.testclient import TestClient

from app import bootstrap
from app.bootstrap import build_app


@pytest.mark.spec('0020')
def test_react_frontend__entry_page__loads_a_served_local_module() -> None:
    """
    Тест проверяет, что FastAPI отдаёт страницу собранного интерфейса и её исполняемый JS-модуль.

    Ожидание: HTML подключает один локальный модуль, а его URL возвращает непустой JavaScript.
    Старый обработчик /app.js не запускается вместе с React. Проверка не требует запуска БД.
    """
    # Без контекста TestClient не запускает lifespan с проверкой схемы БД: проверяем только статическую раздачу.
    client = TestClient(build_app())

    try:
        response = client.get('/')

        assert response.status_code == 200
        assert response.headers['content-type'].startswith('text/html')
        assert response.headers['cache-control'] == 'no-cache'

        script_tags = re.findall(r'<script\b[^>]*>', response.text, flags=re.IGNORECASE)
        module_tags = [
            tag for tag in script_tags if re.search(r'''\btype\s*=\s*["']module["']''', tag, flags=re.IGNORECASE)
        ]

        assert len(module_tags) == 1, 'The page must load one built JavaScript module'
        source = re.search(r'''\bsrc\s*=\s*["']([^"']+)["']''', module_tags[0], flags=re.IGNORECASE)
        assert source is not None, 'The entry module must have a source URL'

        module_url = source.group(1)
        parsed_url = urlsplit(module_url)
        assert parsed_url.scheme == ''
        assert parsed_url.netloc == ''
        assert parsed_url.path.startswith('/')
        assert parsed_url.path.endswith('.js')
        assert not any(re.search(r'''\bsrc\s*=\s*["']/app\.js(?:[?"'])''', tag) for tag in script_tags)

        module_response = client.get(module_url)

        assert module_response.status_code == 200
        assert module_response.headers['content-type'].split(';', 1)[0] in (
            'text/javascript',
            'application/javascript',
        )
        assert module_response.content.strip()
        assert module_response.headers['cache-control'] == 'public, max-age=31536000, immutable'
    finally:
        client.close()


@pytest.mark.spec('0020')
def test_react_frontend__missing_build__fails_before_database_startup(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """
    Тест проверяет запуск приложения без собранного интерфейса.

    Ожидание: приложение отказывается запускаться до обращения к БД и указывает команду сборки.
    """
    monkeypatch.setattr(bootstrap, 'FRONTEND_DIST', tmp_path)

    with (
        pytest.raises(RuntimeError, match='Frontend build is missing; run npm ci and npm run build'),
        TestClient(build_app()),
    ):
        pass
