import pytest

from app.bootstrap import build_app


@pytest.mark.spec('0004')
class TestBuildApp:
    def test_registers_all_expected_routes(self):
        """
        Тест проверяет, что build_app() действительно собирает приложение целиком - подключает
        и API-роутер, и health-роутер, а не только часть bootstrap-функций по ошибке в порядке
        вызова внутри build_app().

        Ожидание: среди путей собранного приложения есть /healthcheck, /ready и /api/board
        """
        app = build_app()

        paths = set(app.openapi()['paths'].keys())

        assert '/healthcheck' in paths
        assert '/ready' in paths
        assert '/api/board' in paths
