import re
from pathlib import Path


def test_concept_description__supports_multiline_input_and_display() -> None:
    """
    Тест проверяет поддержку переносов строк в описаниях понятий базы знаний.

    Ожидание: описание вводится в textarea, а при отображении сохраняются переносы строк.
    Версия в URL стилей не позволяет использовать прежние стили для обновлённой формы.
    """
    static = Path(__file__).resolve().parents[1] / 'static'
    html = (static / 'index.html').read_text()
    css = (static / 'style.css').read_text()

    assert re.search(r'href="/style\.css\?v=[^"]+"', html)
    assert re.search(r'<textarea\b[^>]*\bid="input-concept-description"[^>]*></textarea>', html)
    assert re.search(r'\.concept-desc\s*\{[^}]*\bwhite-space:\s*pre-wrap\s*;', css)
