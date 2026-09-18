import pytest

import app.health as health_module


@pytest.mark.spec('0002')
class TestHealthcheck:
    def test_liveness__always_returns_ok(self, client):
        """
        Тест проверяет базовый liveness-эндпоинт /healthcheck - он должен отвечать 200 всегда,
        пока процесс жив, независимо от состояния БД или чего-либо ещё.

        Ожидание: GET /healthcheck -> 200, {"status": "ok"}
        """
        response = client.get('/healthcheck')

        assert response.status_code == 200
        assert response.json() == {'status': 'ok'}


@pytest.mark.spec('0002')
class TestReadiness:
    def test_db_reachable__returns_ready(self, client):
        """
        Тест проверяет readiness-эндпоинт /ready в нормальной ситуации, когда БД отвечает на
        запрос (тестовая БД поднята фикстурой client/db_path).

        Ожидание: GET /ready -> 200, {"status": "ready"}
        """
        response = client.get('/ready')

        assert response.status_code == 200
        assert response.json() == {'status': 'ready'}

    def test_db_unreachable__returns_service_unavailable(self, client, monkeypatch):
        """
        Тест проверяет readiness-эндпоинт /ready, когда БД недоступна (например, файл БД
        повреждён или закончилось место на диске) - симулируем через monkeypatch get_connection,
        чтобы он бросал исключение.

        Ожидание: GET /ready -> 503, {"status": "not_ready"}, приложение не падает целиком
        """

        def broken_connection():
            raise RuntimeError('db is down')

        monkeypatch.setattr(health_module, 'get_connection', broken_connection)

        response = client.get('/ready')

        assert response.status_code == 503
        assert response.json() == {'status': 'not_ready'}
