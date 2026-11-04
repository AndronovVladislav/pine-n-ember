from fastapi.testclient import TestClient


def test_finance__income_categories_are_present_next_to_expenses(client: TestClient) -> None:
    """
    Тест проверяет наличие отдельных списков категорий расходов и доходов на странице финансов.

    Ожидание: страница содержит оба списка, а график баланса расположен после них.
    """
    response = client.get('/')

    assert response.status_code == 200
    html = response.text
    assert 'id="finance-income-categories"' in html
    assert html.index('id="finance-expense-categories"') < html.index('id="finance-income-categories"')
    assert html.index('id="finance-income-categories"') < html.index('id="finance-spark"')
