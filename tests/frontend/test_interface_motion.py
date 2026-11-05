import subprocess
from pathlib import Path

import pytest


@pytest.mark.spec('0021')
@pytest.mark.parametrize('scenario', ['dialog', 'reduced', 'board', 'finance', 'interrupt'])
def test_interface_motion__user_actions_and_preferences__respect_transition_lifecycle(scenario: str) -> None:
    """
    Тест проверяет движение диалогов, карточек и финансовых значений в настоящем браузере.

    Ожидание: переходы завершаются с корректным фокусом и состоянием данных, ошибка сохраняет ввод,
    а уменьшение движения отключает эффекты. Повторы не дублируют запросы. Рабочая БД не используется.
    """
    frontend = Path(__file__).resolve().parents[2] / 'frontend'
    result = subprocess.run(
        ['node', 'tests/motion.mjs', scenario],
        cwd=frontend,
        capture_output=True,
        text=True,
        timeout=45,
        check=False,
    )

    assert result.returncode == 0, result.stdout + result.stderr
