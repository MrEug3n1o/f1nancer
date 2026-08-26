from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.currency_utils import require_enabled_currency
from app.database import get_db
from app.deposit_utils import (
    days_remaining,
    maturity_interest_cents,
    simple_interest_cents,
    term_progress_pct,
)
from app.models import Category, Deposit, DepositStatus, DepositType, Transaction
from app.schemas import DepositCreate, DepositOut, DepositUpdate

router = APIRouter(prefix="/deposits", tags=["deposits"])

DEPOSIT_RETURN_CATEGORY = "Deposit return"
DEPOSIT_RETURN_COLOR = "#2D6A4F"


def _ensure_deposit_return_category(db: Session) -> Category:
    category = (
        db.query(Category)
        .filter(
            Category.name == DEPOSIT_RETURN_CATEGORY,
            Category.type == "income",
        )
        .first()
    )
    if category:
        return category
    category = Category(
        name=DEPOSIT_RETURN_CATEGORY,
        type="income",
        color=DEPOSIT_RETURN_COLOR,
    )
    db.add(category)
    db.flush()
    return category


def _payout_cents(deposit: Deposit) -> int:
    """Principal plus accrued interest (bank) through today or maturity."""
    interest = 0
    if (
        deposit.type == DepositType.bank.value
        and deposit.annual_rate_bps is not None
    ):
        interest = simple_interest_cents(
            deposit.principal_cents,
            deposit.annual_rate_bps,
            deposit.start_date,
            deposit.end_date,
        )
    return deposit.principal_cents + interest


def _validate_payload(
    deposit_type: str,
    annual_rate_bps: int | None,
    start_date: date,
    end_date: date,
) -> None:
    if end_date < start_date:
        raise HTTPException(
            status_code=400, detail="end_date must be on or after start_date"
        )
    if deposit_type == DepositType.bank.value:
        if annual_rate_bps is None:
            raise HTTPException(
                status_code=400, detail="annual_rate_bps is required for bank deposits"
            )
    elif deposit_type == DepositType.rental.value:
        if annual_rate_bps is not None and annual_rate_bps != 0:
            raise HTTPException(
                status_code=400,
                detail="annual_rate_bps is not used for rental deposits",
            )


def _to_out(deposit: Deposit) -> DepositOut:
    accrued = 0
    maturity_value: int | None = None
    if deposit.type == DepositType.bank.value and deposit.annual_rate_bps is not None:
        accrued = simple_interest_cents(
            deposit.principal_cents,
            deposit.annual_rate_bps,
            deposit.start_date,
            deposit.end_date,
        )
        maturity_interest = maturity_interest_cents(
            deposit.principal_cents,
            deposit.annual_rate_bps,
            deposit.start_date,
            deposit.end_date,
        )
        maturity_value = deposit.principal_cents + maturity_interest

    current_value = deposit.principal_cents + accrued
    return DepositOut(
        id=deposit.id,
        name=deposit.name,
        type=deposit.type,
        principal_cents=deposit.principal_cents,
        currency_code=deposit.currency_code,
        start_date=deposit.start_date,
        end_date=deposit.end_date,
        annual_rate_bps=deposit.annual_rate_bps,
        counterparty=deposit.counterparty,
        note=deposit.note,
        status=deposit.status,
        created_at=deposit.created_at,
        accrued_interest_cents=accrued,
        current_value_cents=current_value,
        maturity_value_cents=maturity_value,
        days_remaining=days_remaining(deposit.end_date),
        term_progress_pct=term_progress_pct(deposit.start_date, deposit.end_date),
    )


@router.get("", response_model=list[DepositOut])
def list_deposits(db: Session = Depends(get_db)):
    deposits = db.query(Deposit).order_by(Deposit.created_at.desc()).all()
    return [_to_out(d) for d in deposits]


@router.post("", response_model=DepositOut, status_code=201)
def create_deposit(payload: DepositCreate, db: Session = Depends(get_db)):
    currency_code = require_enabled_currency(db, payload.currency_code)
    rate = payload.annual_rate_bps
    if payload.type == DepositType.rental.value:
        rate = None
    _validate_payload(payload.type, rate, payload.start_date, payload.end_date)

    deposit = Deposit(
        name=payload.name.strip(),
        type=payload.type,
        principal_cents=payload.principal_cents,
        currency_code=currency_code,
        start_date=payload.start_date,
        end_date=payload.end_date,
        annual_rate_bps=rate,
        counterparty=(
            payload.counterparty.strip() if payload.counterparty else None
        ),
        note=payload.note,
        status=DepositStatus.active.value,
    )
    db.add(deposit)
    db.commit()
    db.refresh(deposit)
    return _to_out(deposit)


@router.patch("/{deposit_id}", response_model=DepositOut)
def update_deposit(
    deposit_id: int, payload: DepositUpdate, db: Session = Depends(get_db)
):
    deposit = db.get(Deposit, deposit_id)
    if not deposit:
        raise HTTPException(status_code=404, detail="Deposit not found")

    data = payload.model_dump(exclude_unset=True)
    if "currency_code" in data:
        data["currency_code"] = require_enabled_currency(db, data["currency_code"])
    if "name" in data and data["name"] is not None:
        data["name"] = data["name"].strip()
    if "counterparty" in data and data["counterparty"] is not None:
        data["counterparty"] = data["counterparty"].strip() or None

    for key, value in data.items():
        setattr(deposit, key, value)

    rate = deposit.annual_rate_bps
    if deposit.type == DepositType.rental.value:
        deposit.annual_rate_bps = None
        rate = None
    _validate_payload(deposit.type, rate, deposit.start_date, deposit.end_date)

    db.commit()
    db.refresh(deposit)
    return _to_out(deposit)


@router.post("/{deposit_id}/complete", response_model=DepositOut)
def complete_deposit(deposit_id: int, db: Session = Depends(get_db)):
    deposit = db.get(Deposit, deposit_id)
    if not deposit:
        raise HTTPException(status_code=404, detail="Deposit not found")
    if deposit.status != DepositStatus.active.value:
        raise HTTPException(status_code=400, detail="Deposit is not active")

    payout = _payout_cents(deposit)
    if payout <= 0:
        raise HTTPException(status_code=400, detail="Deposit payout must be positive")

    if deposit.type == DepositType.bank.value:
        deposit.status = DepositStatus.matured.value
        note = f"Deposit matured: {deposit.name}"
    else:
        deposit.status = DepositStatus.returned.value
        note = f"Deposit returned: {deposit.name}"

    category = _ensure_deposit_return_category(db)
    db.add(
        Transaction(
            amount=payout,
            currency_code=deposit.currency_code,
            date=date.today(),
            type="income",
            category_id=category.id,
            note=note,
        )
    )

    db.commit()
    db.refresh(deposit)
    return _to_out(deposit)


@router.delete("/{deposit_id}", status_code=204)
def delete_deposit(deposit_id: int, db: Session = Depends(get_db)):
    deposit = db.get(Deposit, deposit_id)
    if not deposit:
        raise HTTPException(status_code=404, detail="Deposit not found")
    db.delete(deposit)
    db.commit()
