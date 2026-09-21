from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select

import app.domains.finance.exchange_rate as exchange_rate_module
from app.domains.errors import ExternalServiceUnavailable
from app.domains.finance import models as finance_models

TODAY = date(2026, 9, 20)


def category_row_as_dict(conn, category_id):
    row = conn.execute(select(finance_models.Category).where(finance_models.Category.id == category_id)).one()
    return {k: v for k, v in row._mapping.items() if k != 'id'}


def operation_row_as_dict(conn, operation_id):
    row = conn.execute(select(finance_models.Operation).where(finance_models.Operation.id == operation_id)).one()
    return {k: v for k, v in row._mapping.items() if k != 'id'}


def create_expense_category(client, name='Продукты'):
    return client.post('/api/finance/expense-categories', json={'name': name}).json()


def create_income_category(client, name='Зарплата'):
    return client.post('/api/finance/income-categories', json={'name': name}).json()


def fixed_rate(rate):
    def _fake(on_date):
        return rate

    return _fake


@pytest.mark.spec('0012')
class TestExpenseCategories:
    def test_create_row_is_persisted_fully(self, client, db_connection):
        """
        Тест проверяет создание категории расходов через POST /api/finance/expense-categories.

        Ожидание: в categories появится ровно одна запись с kind='expense' и переданным name
        """
        response = client.post('/api/finance/expense-categories', json={'name': 'Продукты'})

        assert response.status_code == 200
        body = response.json()
        assert category_row_as_dict(db_connection, body['id']) == {'kind': 'expense', 'name': 'Продукты'}

    def test_rename(self, client):
        """
        Тест проверяет переименование категории через PATCH /api/finance/categories/{id}.

        Ожидание: имя меняется, kind остаётся expense
        """
        category = create_expense_category(client)

        response = client.patch(f'/api/finance/categories/{category["id"]}', json={'name': 'Еда вне дома'})

        assert response.status_code == 200
        body = response.json()
        assert body['name'] == 'Еда вне дома'
        assert body['kind'] == 'expense'

    def test_delete_cascades_to_its_operations(self, client, db_connection):
        """
        Тест проверяет, что удаление категории удаляет и её операции (FK ondelete=CASCADE) -
        backend не блокирует удаление наличием операций, предупреждение - забота фронтенда.

        Ожидание: после DELETE /api/finance/categories/{id} строки операции этой категории в
        operations не остаётся
        """
        category = create_expense_category(client)
        operation = client.post(
            '/api/finance/expenses',
            json={'category_id': category['id'], 'amount': 500, 'currency': 'RUB', 'date': str(TODAY)},
        ).json()

        response = client.delete(f'/api/finance/categories/{category["id"]}')

        assert response.status_code == 204
        remaining = db_connection.execute(
            select(finance_models.Operation).where(finance_models.Operation.id == operation['id'])
        ).first()
        assert remaining is None

    def test_income_categories_are_a_separate_list(self, client):
        """
        Тест проверяет, что GET /api/finance/expense-categories не показывает категории доходов.

        Ожидание: список категорий расходов не содержит созданную категорию дохода
        """
        create_income_category(client, name='Зарплата')

        response = client.get('/api/finance/expense-categories')

        assert response.status_code == 200
        assert response.json() == []


@pytest.mark.spec('0012')
class TestCreateExpense:
    def test_rub_currency_does_not_call_exchange_rate(self, client, monkeypatch):
        """
        Тест проверяет создание расхода в RUB через POST /api/finance/expenses.

        Ожидание: rate=1, amount_rub == amount, к ЦБ РФ за курсом не обращаемся вообще
        """

        def _fail(on_date):
            raise AssertionError('fetch_byn_to_rub_rate не должен вызываться для RUB')

        monkeypatch.setattr(exchange_rate_module, 'fetch_byn_to_rub_rate', _fail)
        category = create_expense_category(client)

        response = client.post(
            '/api/finance/expenses',
            json={'category_id': category['id'], 'amount': 1200, 'currency': 'RUB', 'date': str(TODAY)},
        )

        assert response.status_code == 200
        body = response.json()
        assert body['rate'] == '1.000000'
        assert body['amount_rub'] == '1200.00'
        assert body['kind'] == 'expense'

    def test_byn_currency_calls_exchange_rate_with_operation_date(self, client, monkeypatch):
        """
        Тест проверяет создание расхода в BYN - конвертация должна пройти через ЦБ РФ на бэкенде,
        с датой самой операции (не сегодняшней датой сервера).

        Ожидание: fetch_byn_to_rub_rate вызван с датой операции, amount_rub = amount * rate
        """
        seen_dates = []

        def _fake(on_date):
            seen_dates.append(on_date)
            return Decimal('34.5')

        monkeypatch.setattr(exchange_rate_module, 'fetch_byn_to_rub_rate', _fake)
        category = create_expense_category(client)
        operation_date = TODAY - timedelta(days=10)

        response = client.post(
            '/api/finance/expenses',
            json={'category_id': category['id'], 'amount': 20, 'currency': 'BYN', 'date': str(operation_date)},
        )

        assert response.status_code == 200
        body = response.json()
        assert seen_dates == [operation_date]
        assert body['rate'] == '34.500000'
        assert body['amount_rub'] == '690.00'

    def test_missing_category__returns_404(self, client):
        """
        Тест проверяет создание расхода с несуществующим category_id.

        Ожидание: 404, операция не создаётся
        """
        response = client.post(
            '/api/finance/expenses',
            json={'category_id': 'does-not-exist', 'amount': 100, 'currency': 'RUB', 'date': str(TODAY)},
        )

        assert response.status_code == 404

    def test_income_category_id__returns_400(self, client):
        """
        Тест проверяет попытку создать расход с category_id категории дохода.

        Ожидание: 400 - категория дохода не может использоваться для расхода
        """
        income_category = create_income_category(client)

        response = client.post(
            '/api/finance/expenses',
            json={'category_id': income_category['id'], 'amount': 100, 'currency': 'RUB', 'date': str(TODAY)},
        )

        assert response.status_code == 400

    def test_exchange_rate_service_unavailable__returns_502(self, client, monkeypatch):
        """
        Тест проверяет ситуацию, когда ЦБ РФ недоступен при создании расхода в BYN.

        Ожидание: 502, тело ответа не содержит текст оригинального исключения
        """

        def _fail(on_date):
            raise ExternalServiceUnavailable('Не удалось получить курс валют от ЦБ РФ')

        monkeypatch.setattr(exchange_rate_module, 'fetch_byn_to_rub_rate', _fail)
        category = create_expense_category(client)

        response = client.post(
            '/api/finance/expenses',
            json={'category_id': category['id'], 'amount': 20, 'currency': 'BYN', 'date': str(TODAY)},
        )

        assert response.status_code == 502


@pytest.mark.spec('0012')
class TestCreateIncome:
    def test_rub_currency_row_is_persisted_fully(self, client, db_connection):
        """
        Тест проверяет создание дохода в RUB через POST /api/finance/incomes.

        Ожидание: строка в operations хранит положительный amount (доход), amount_rub == amount
        """
        category = create_income_category(client)

        response = client.post(
            '/api/finance/incomes',
            json={'category_id': category['id'], 'amount': 50000, 'currency': 'RUB', 'date': str(TODAY)},
        )

        assert response.status_code == 200
        body = response.json()
        row = operation_row_as_dict(db_connection, body['id'])
        assert row['amount'] == Decimal('50000.00')
        assert row['amount_rub'] == Decimal('50000.00')
        assert body['kind'] == 'income'

    def test_expense_category_id__returns_400(self, client):
        """
        Тест проверяет попытку создать доход с category_id категории расхода.

        Ожидание: 400
        """
        expense_category = create_expense_category(client)

        response = client.post(
            '/api/finance/incomes',
            json={'category_id': expense_category['id'], 'amount': 100, 'currency': 'RUB', 'date': str(TODAY)},
        )

        assert response.status_code == 400


@pytest.mark.spec('0012')
class TestUpdateOperation:
    def test_amount_only_change_does_not_refetch_rate(self, client, monkeypatch):
        """
        Тест проверяет частичное обновление суммы операции без смены валюты.

        Ожидание: PATCH не обращается за новым курсом - amount_rub пересчитан по уже сохранённому
        rate, а не по свежему вызову ЦБ РФ
        """
        monkeypatch.setattr(exchange_rate_module, 'fetch_byn_to_rub_rate', fixed_rate(Decimal('34.5')))
        category = create_expense_category(client)
        operation = client.post(
            '/api/finance/expenses',
            json={'category_id': category['id'], 'amount': 20, 'currency': 'BYN', 'date': str(TODAY)},
        ).json()

        def _fail(on_date):
            raise AssertionError('rate не должен запрашиваться заново при правке одной суммы')

        monkeypatch.setattr(exchange_rate_module, 'fetch_byn_to_rub_rate', _fail)

        response = client.patch(f'/api/finance/operations/{operation["id"]}', json={'amount': 40})

        assert response.status_code == 200
        body = response.json()
        assert body['rate'] == '34.500000'
        assert body['amount_rub'] == '1380.00'

    def test_currency_change_refetches_rate_using_operation_date_not_edit_date(self, client, monkeypatch):
        """
        Тест проверяет смену валюты операции (RUB -> BYN) при редактировании.

        Ожидание: за новым курсом идём на дату самой операции, а не на "сегодня"
        """
        category = create_expense_category(client)
        operation_date = TODAY - timedelta(days=30)
        operation = client.post(
            '/api/finance/expenses',
            json={'category_id': category['id'], 'amount': 100, 'currency': 'RUB', 'date': str(operation_date)},
        ).json()

        seen_dates = []

        def _fake(on_date):
            seen_dates.append(on_date)
            return Decimal(2)

        monkeypatch.setattr(exchange_rate_module, 'fetch_byn_to_rub_rate', _fake)

        response = client.patch(f'/api/finance/operations/{operation["id"]}', json={'currency': 'BYN'})

        assert response.status_code == 200
        assert seen_dates == [operation_date]
        body = response.json()
        assert body['rate'] == '2.000000'
        assert body['amount_rub'] == '200.00'

    def test_category_change_to_mismatched_kind__returns_400(self, client):
        """
        Тест проверяет попытку переключить операцию-расход на категорию дохода через PATCH.

        Ожидание: 400 - нельзя переквалифицировать расход в доход сменой категории
        """
        expense_category = create_expense_category(client)
        income_category = create_income_category(client)
        operation = client.post(
            '/api/finance/expenses',
            json={'category_id': expense_category['id'], 'amount': 100, 'currency': 'RUB', 'date': str(TODAY)},
        ).json()

        response = client.patch(
            f'/api/finance/operations/{operation["id"]}', json={'category_id': income_category['id']}
        )

        assert response.status_code == 400

    def test_missing_operation__returns_404(self, client):
        """
        Тест проверяет PATCH несуществующей операции.

        Ожидание: 404
        """
        response = client.patch('/api/finance/operations/does-not-exist', json={'amount': 10})

        assert response.status_code == 404


@pytest.mark.spec('0012')
class TestDeleteOperation:
    def test_delete_removes_row(self, client, db_connection):
        """
        Тест проверяет удаление операции через DELETE /api/finance/operations/{id}.

        Ожидание: строка удаляется из operations
        """
        category = create_expense_category(client)
        operation = client.post(
            '/api/finance/expenses',
            json={'category_id': category['id'], 'amount': 100, 'currency': 'RUB', 'date': str(TODAY)},
        ).json()

        response = client.delete(f'/api/finance/operations/{operation["id"]}')

        assert response.status_code == 204
        remaining = db_connection.execute(
            select(finance_models.Operation).where(finance_models.Operation.id == operation['id'])
        ).first()
        assert remaining is None


@pytest.mark.spec('0012')
class TestDashboard:
    def test_requires_date_range_params(self, client):
        """
        Тест проверяет вызов /api/finance/dashboard без обязательных параметров периода.

        Ожидание: 422 - date_from/date_to обязательны, диапазон "по умолчанию" решает фронтенд
        """
        response = client.get('/api/finance/dashboard')

        assert response.status_code == 422

    def test_totals_and_breakdown_within_date_range(self, client):
        """
        Тест проверяет суммы и разбивку по категориям /api/finance/dashboard за диапазон дат,
        с операцией за пределами диапазона, которая не должна учитываться.

        Ожидание: income_total_rub/expense_total_rub/balance_rub и разбивка по категориям
        учитывают только операции внутри date_from..date_to
        """
        food = create_expense_category(client, name='Еда')
        salary = create_income_category(client, name='Зарплата')
        client.post(
            '/api/finance/expenses',
            json={'category_id': food['id'], 'amount': 3000, 'currency': 'RUB', 'date': str(TODAY)},
        )
        client.post(
            '/api/finance/incomes',
            json={'category_id': salary['id'], 'amount': 100000, 'currency': 'RUB', 'date': str(TODAY)},
        )
        outside_date = TODAY - timedelta(days=60)
        client.post(
            '/api/finance/expenses',
            json={'category_id': food['id'], 'amount': 999999, 'currency': 'RUB', 'date': str(outside_date)},
        )

        response = client.get(
            '/api/finance/dashboard', params={'date_from': str(TODAY - timedelta(days=5)), 'date_to': str(TODAY)}
        )

        assert response.status_code == 200
        body = response.json()
        assert body['expense_total_rub'] == '3000.00'
        assert body['income_total_rub'] == '100000.00'
        assert body['balance_rub'] == '97000.00'
        assert body['expense_by_category'] == [
            {'category_id': food['id'], 'category_name': 'Еда', 'amount_rub': '3000.00'}
        ]
        assert body['income_by_category'] == [
            {'category_id': salary['id'], 'category_name': 'Зарплата', 'amount_rub': '100000.00'}
        ]

    def test_balance_series_is_cumulative_over_dates(self, client):
        """
        Тест проверяет накопительный баланс balance_series по дням.

        Ожидание: второй день суммирует net первого и второго дня, а не только свой собственный
        """
        food = create_expense_category(client)
        day1 = TODAY - timedelta(days=1)
        day2 = TODAY
        client.post(
            '/api/finance/expenses',
            json={'category_id': food['id'], 'amount': 100, 'currency': 'RUB', 'date': str(day1)},
        )
        client.post(
            '/api/finance/expenses',
            json={'category_id': food['id'], 'amount': 50, 'currency': 'RUB', 'date': str(day2)},
        )

        response = client.get('/api/finance/dashboard', params={'date_from': str(day1), 'date_to': str(day2)})

        assert response.status_code == 200
        series = response.json()['balance_series']
        assert series == [
            {'date': str(day1), 'cumulative_rub': '-100.00'},
            {'date': str(day2), 'cumulative_rub': '-150.00'},
        ]

    def test_recent_operations_do_not_leak_sign(self, client):
        """
        Тест проверяет, что recent_operations отдаёт положительную величину суммы и явный kind,
        а не отрицательное число для расхода.

        Ожидание: amount и amount_rub положительные, kind == 'expense'
        """
        food = create_expense_category(client)
        client.post(
            '/api/finance/expenses',
            json={'category_id': food['id'], 'amount': 250, 'currency': 'RUB', 'date': str(TODAY)},
        )

        response = client.get('/api/finance/dashboard', params={'date_from': str(TODAY), 'date_to': str(TODAY)})

        assert response.status_code == 200
        [recent] = response.json()['recent_operations']
        assert recent['kind'] == 'expense'
        assert recent['amount'] == '250.00'
        assert recent['amount_rub'] == '250.00'
