from datetime import date

from fastapi import APIRouter, HTTPException

from app.db import get_connection
from app.domains.finance import FinanceRepository, SqlAlchemyFinanceRepository
from app.errors import handle_domain_errors
from app.schemas import (
    CategoryCreate,
    CategoryOut,
    CategoryUpdate,
    ExpenseOperationCreate,
    FinanceDashboardOut,
    IncomeOperationCreate,
    OperationOut,
    OperationUpdate,
)

router = APIRouter()


def _finance_repo() -> FinanceRepository:
    return SqlAlchemyFinanceRepository(get_connection())


@router.get('/finance/dashboard')
def get_dashboard(date_from: date, date_to: date) -> FinanceDashboardOut:
    with _finance_repo() as repo:
        return repo.get_dashboard(date_from, date_to)


@router.get('/finance/expense-categories')
def list_expense_categories() -> list[CategoryOut]:
    with _finance_repo() as repo:
        return repo.list_categories('expense')


@router.post('/finance/expense-categories')
def create_expense_category(payload: CategoryCreate) -> CategoryOut:
    name = payload.name.strip()
    if not name:
        raise HTTPException(400, 'name is required')
    with _finance_repo() as repo:
        return repo.create_category('expense', name)


@router.get('/finance/income-categories')
def list_income_categories() -> list[CategoryOut]:
    with _finance_repo() as repo:
        return repo.list_categories('income')


@router.post('/finance/income-categories')
def create_income_category(payload: CategoryCreate) -> CategoryOut:
    name = payload.name.strip()
    if not name:
        raise HTTPException(400, 'name is required')
    with _finance_repo() as repo:
        return repo.create_category('income', name)


@router.patch('/finance/categories/{category_id}')
@handle_domain_errors
def update_category(category_id: str, payload: CategoryUpdate) -> CategoryOut:
    with _finance_repo() as repo:
        return repo.update_category(category_id, payload.name)


@router.delete('/finance/categories/{category_id}', status_code=204)
def delete_category(category_id: str) -> None:
    with _finance_repo() as repo:
        repo.delete_category(category_id)


@router.post('/finance/expenses')
@handle_domain_errors
def create_expense(payload: ExpenseOperationCreate) -> OperationOut:
    with _finance_repo() as repo:
        return repo.create_operation('expense', payload.category_id, payload.amount, payload.currency, payload.date)


@router.post('/finance/incomes')
@handle_domain_errors
def create_income(payload: IncomeOperationCreate) -> OperationOut:
    with _finance_repo() as repo:
        return repo.create_operation('income', payload.category_id, payload.amount, payload.currency, payload.date)


@router.patch('/finance/operations/{operation_id}')
@handle_domain_errors
def update_operation(operation_id: str, payload: OperationUpdate) -> OperationOut:
    with _finance_repo() as repo:
        return repo.update_operation(
            operation_id,
            category_id=payload.category_id,
            amount=payload.amount,
            currency=payload.currency,
            on_date=payload.date,
        )


@router.delete('/finance/operations/{operation_id}', status_code=204)
def delete_operation(operation_id: str) -> None:
    with _finance_repo() as repo:
        repo.delete_operation(operation_id)
