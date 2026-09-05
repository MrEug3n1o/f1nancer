"""Helpers for credit/debt remaining balances and tagged transactions."""

from __future__ import annotations

from datetime import date

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.deposit_utils import days_remaining, simple_interest_cents
from app.models import (
    Category,
    CategoryType,
    CreditDebt,
    CreditDebtDirection,
    CreditDebtSource,
    CreditDebtStatus,
    Transaction,
)

BORROWED_CATEGORY = "Borrowed"
BORROWED_COLOR = "#40916C"
LENT_CATEGORY = "Lent"
LENT_COLOR = "#335C81"
DEBT_PAYMENT_CATEGORY = "Debt payment"
DEBT_PAYMENT_COLOR = "#A4161A"
CREDIT_REPAYMENT_CATEGORY = "Credit repayment"
CREDIT_REPAYMENT_COLOR = "#2D6A4F"


def opening_txn_type(direction: str) -> str:
    if direction == CreditDebtDirection.credit.value:
        return CategoryType.expense.value
    return CategoryType.income.value


def payment_txn_type(direction: str) -> str:
    if direction == CreditDebtDirection.credit.value:
        return CategoryType.income.value
    return CategoryType.expense.value


def _ensure_category(db: Session, name: str, cat_type: str, color: str) -> Category:
    category = (
        db.query(Category)
        .filter(Category.name == name, Category.type == cat_type)
        .first()
    )
    if category:
        return category
    category = Category(name=name, type=cat_type, color=color)
    db.add(category)
    db.flush()
    return category


def opening_category(db: Session, direction: str) -> Category:
    if direction == CreditDebtDirection.credit.value:
        return _ensure_category(
            db, LENT_CATEGORY, CategoryType.expense.value, LENT_COLOR
        )
    return _ensure_category(
        db, BORROWED_CATEGORY, CategoryType.income.value, BORROWED_COLOR
    )


def payment_category(db: Session, direction: str) -> Category:
    if direction == CreditDebtDirection.credit.value:
        return _ensure_category(
            db,
            CREDIT_REPAYMENT_CATEGORY,
            CategoryType.income.value,
            CREDIT_REPAYMENT_COLOR,
        )
    return _ensure_category(
        db,
        DEBT_PAYMENT_CATEGORY,
        CategoryType.expense.value,
        DEBT_PAYMENT_COLOR,
    )


def validate_payload(
    source: str,
    annual_rate_bps: int | None,
    start_date: date,
    due_date: date | None,
) -> None:
    if due_date is not None and due_date < start_date:
        raise HTTPException(
            status_code=400, detail="due_date must be on or after start_date"
        )
    if source == CreditDebtSource.bank.value:
        if due_date is None:
            raise HTTPException(
                status_code=400, detail="due_date is required for bank credits and debts"
            )
        if annual_rate_bps is None:
            raise HTTPException(
                status_code=400,
                detail="annual_rate_bps is required for bank credits and debts",
            )


def accrued_interest_cents(item: CreditDebt, as_of: date | None = None) -> int:
    if not item.annual_rate_bps:
        return 0
    today = as_of or date.today()
    end = item.due_date or today
    return simple_interest_cents(
        item.principal_cents,
        item.annual_rate_bps,
        item.start_date,
        end,
        as_of=today,
    )


def paid_cents(db: Session, credit_debt_id: int, direction: str) -> int:
    total = (
        db.query(func.coalesce(func.sum(Transaction.amount), 0))
        .filter(
            Transaction.credit_debt_id == credit_debt_id,
            Transaction.type == payment_txn_type(direction),
        )
        .scalar()
    )
    return int(total or 0)


def remaining_cents(db: Session, item: CreditDebt) -> int:
    if item.status == CreditDebtStatus.paid.value:
        return 0
    owed = item.principal_cents + accrued_interest_cents(item)
    return max(0, owed - paid_cents(db, item.id, item.direction))


def progress_pct(paid: int, principal: int, accrued: int) -> float:
    total = principal + accrued
    if total <= 0:
        return 0.0
    return min(100.0, round(paid / total * 100, 1))


def days_until_due(item: CreditDebt) -> int | None:
    if item.due_date is None:
        return None
    return days_remaining(item.due_date)


def tagged_transaction_count(db: Session, credit_debt_id: int) -> int:
    return (
        db.query(Transaction)
        .filter(Transaction.credit_debt_id == credit_debt_id)
        .count()
    )


def sync_credit_debt_status(db: Session, credit_debt_id: int | None) -> None:
    if not credit_debt_id:
        return
    item = db.get(CreditDebt, credit_debt_id)
    if not item or item.status == CreditDebtStatus.cancelled.value:
        return
    paid = paid_cents(db, item.id, item.direction)
    owed = item.principal_cents + accrued_interest_cents(item)
    if owed - paid <= 0:
        item.status = CreditDebtStatus.paid.value
    elif (
        item.status == CreditDebtStatus.paid.value
        and paid < item.principal_cents
    ):
        item.status = CreditDebtStatus.active.value


def validate_credit_debt_transaction(
    db: Session,
    *,
    credit_debt_id: int | None,
    txn_type: str,
    currency_code: str,
    require_active: bool = True,
) -> CreditDebt | None:
    if credit_debt_id is None:
        return None
    item = db.get(CreditDebt, credit_debt_id)
    if not item:
        raise HTTPException(status_code=404, detail="Credit or debt not found")
    if require_active and item.status != CreditDebtStatus.active.value:
        raise HTTPException(status_code=400, detail="Credit or debt is not active")
    allowed = {opening_txn_type(item.direction), payment_txn_type(item.direction)}
    if txn_type not in allowed:
        raise HTTPException(
            status_code=400,
            detail="Transaction type does not match this credit or debt",
        )
    if currency_code != item.currency_code:
        raise HTTPException(
            status_code=400,
            detail="Transaction currency must match the credit or debt",
        )
    return item
