import pytest

import app.api as api_module


@pytest.mark.spec('0002')
class TestUnhandledExceptionHandler:
    def test_unexpected_exception__returns_generic_500_without_leaking_details(
        self, client_allow_server_errors, monkeypatch
    ):
        """
        Тест проверяет, что необработанное исключение внутри хендлера (например, баг в коде,
        а не ожидаемая 4xx-ошибка валидации) не роняет процесс и не отдаёт клиенту traceback
        или текст оригинального исключения.

        Ожидание: POST /api/entities -> 500, тело ответа не содержит текст оригинальной ошибки
        ("boom from gen_id"), сервер остаётся отвечать на следующий запрос
        """
        client = client_allow_server_errors

        def broken_gen_id():
            raise RuntimeError('boom from gen_id')

        monkeypatch.setattr(api_module, 'gen_id', broken_gen_id)

        response = client.post('/api/entities', json={'name': 'git-helper'})

        assert response.status_code == 500
        assert 'boom from gen_id' not in response.text
        assert 'RuntimeError' not in response.text

        monkeypatch.undo()
        follow_up = client.get('/healthcheck')
        assert follow_up.status_code == 200
