from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.credit_debt_utils import (
    accrued_interest_cents,
    days_until_due,
    opening_category,
    opening_txn_type,
    paid_cents,
    payment_category,
    payment_txn_type,
    progress_pct,
    remaining_cents,
    sync_credit_debt_status,
    tagged_transaction_count,
    validate_credit_debt_transaction,
    validate_payload,
)
from app.currency_utils import require_enabled_currency
from app.database import get_db
from app.models import CreditDebt, CreditDebtStatus, Transaction
from app.schemas import (
    CreditDebtCreate,
    CreditDebtOut,
    CreditDebtPay,
    CreditDebtUpdate,
    TransactionOut,
)

router = APIRouter(prefix="/credits-debts", tags=["credits-debts"])


def _item_transactions(db: Session, credit_debt_id: int) -> list[Transaction]:
    return (
        db.query(Transaction)
        .options(joinedload(Transaction.category))
        .filter(Transaction.credit_debt_id == credit_debt_id)
        .order_by(Transaction.date.desc(), Transaction.id.desc())
        .all()
    )


def _to_out(db: Session, item: CreditDebt) -> CreditDebtOut:
    accrued = accrued_interest_cents(item)
    paid = paid_cents(db, item.id, item.direction)
    remaining = remaining_cents(db, item)
    txns = _item_transactions(db, item.id)
    return CreditDebtOut(
        id=item.id,
        name=item.name,
        direction=item.direction,
        source=item.source,
        principal_cents=item.principal_cents,
        currency_code=item.currency_code,
        start_date=item.start_date,
        due_date=item.due_date,
        annual_rate_bps=item.annual_rate_bps,
        counterparty=item.counterparty,
        note=item.note,
        status=item.status,
        created_at=item.created_at,
        accrued_interest_cents=accrued,
        paid_cents=paid,
        remaining_cents=remaining,
        progress_pct=progress_pct(paid, item.principal_cents, accrued),
        days_remaining=days_until_due(item),
        transactions=[TransactionOut.model_validate(t) for t in txns],
    )


def _add_tagged_transaction(
    db: Session,
    item: CreditDebt,
    amount: int,
    txn_type: str,
    category_id: int,
    *,
    when: date | None = None,
    note: str | None = None,
) -> Transaction:
    txn = Transaction(
        amount=amount,
        currency_code=item.currency_code,
        date=when or date.today(),
        type=txn_type,
        category_id=category_id,
        note=note,
        credit_debt_id=item.id,
    )
    db.add(txn)
    db.flush()
    sync_credit_debt_status(db, item.id)
    return txn


@router.get("", response_model=list[CreditDebtOut])
def list_credit_debts(db: Session = Depends(get_db)):
    items = db.query(CreditDebt).order_by(CreditDebt.created_at.desc()).all()
    return [_to_out(db, item) for item in items]


@router.get("/{credit_debt_id}", response_model=CreditDebtOut)
def get_credit_debt(credit_debt_id: int, db: Session = Depends(get_db)):
    item = db.get(CreditDebt, credit_debt_id)
    if not item:
        raise HTTPException(status_code=404, detail="Credit or debt not found")
    return _to_out(db, item)


@router.post("", response_model=CreditDebtOut, status_code=201)
def create_credit_debt(payload: CreditDebtCreate, db: Session = Depends(get_db)):
    currency_code = require_enabled_currency(db, payload.currency_code)
    rate = payload.annual_rate_bps
    if payload.source != "bank" and not rate:
        rate = None
    validate_payload(payload.source, rate, payload.start_date, payload.due_date)

    item = CreditDebt(
        name=payload.name.strip(),
        direction=payload.direction,
        source=payload.source,
        principal_cents=payload.principal_cents,
        currency_code=currency_code,
        start_date=payload.start_date,
        due_date=payload.due_date,
        annual_rate_bps=rate,
        counterparty=(
            payload.counterparty.strip() if payload.counterparty else None
        ),
        note=payload.note,
        status=CreditDebtStatus.active.value,
    )
    db.add(item)
    db.flush()

    open_cat = opening_category(db, item.direction)
    verb = "Lent" if item.direction == "credit" else "Borrowed"
    _add_tagged_transaction(
        db,
        item,
        item.principal_cents,
        opening_txn_type(item.direction),
        open_cat.id,
        when=item.start_date,
        note=f"{verb}: {item.name}",
    )

    if payload.already_paid_cents > 0:
        pay_cat = payment_category(db, item.direction)
        _add_tagged_transaction(
            db,
            item,
            payload.already_paid_cents,
            payment_txn_type(item.direction),
            pay_cat.id,
            when=item.start_date,
            note=f"Already paid toward {item.name}",
        )

    db.commit()
    db.refresh(item)
    return _to_out(db, item)


@router.patch("/{credit_debt_id}", response_model=CreditDebtOut)
def update_credit_debt(
    credit_debt_id: int, payload: CreditDebtUpdate, db: Session = Depends(get_db)
):
    item = db.get(CreditDebt, credit_debt_id)
    if not item:
        raise HTTPException(status_code=404, detail="Credit or debt not found")

    data = payload.model_dump(exclude_unset=True)
    if "currency_code" in data:
        data["currency_code"] = require_enabled_currency(db, data["currency_code"])
        if tagged_transaction_count(db, item.id) and data["currency_code"] != item.currency_code:
            raise HTTPException(
                status_code=400,
                detail="Cannot change currency while this item has transactions",
            )
    if "principal_cents" in data and tagged_transaction_count(db, item.id):
        raise HTTPException(
            status_code=400,
            detail="Cannot change principal while this item has transactions",
        )
    if "name" in data and data["name"] is not None:
        data["name"] = data["name"].strip()
    if "counterparty" in data and data["counterparty"] is not None:
        data["counterparty"] = data["counterparty"].strip() or None

    new_status = data.pop("status", None)
    for key, value in data.items():
        setattr(item, key, value)

    if item.source != "bank" and not item.annual_rate_bps:
        item.annual_rate_bps = None

    validate_payload(item.source, item.annual_rate_bps, item.start_date, item.due_date)

    if new_status == CreditDebtStatus.paid.value:
        if item.status != CreditDebtStatus.active.value:
            raise HTTPException(status_code=400, detail="Credit or debt is not active")
        remaining = remaining_cents(db, item)
        if remaining > 0:
            pay_cat = payment_category(db, item.direction)
            _add_tagged_transaction(
                db,
                item,
                remaining,
                payment_txn_type(item.direction),
                pay_cat.id,
                note=f"Settled remaining on {item.name}",
            )
        item.status = CreditDebtStatus.paid.value
    elif new_status is not None:
        item.status = new_status

    db.commit()
    db.refresh(item)
    return _to_out(db, item)


@router.post("/{credit_debt_id}/pay", response_model=CreditDebtOut)
def pay_credit_debt(
    credit_debt_id: int, payload: CreditDebtPay, db: Session = Depends(get_db)
):
    item = db.get(CreditDebt, credit_debt_id)
    if not item:
        raise HTTPException(status_code=404, detail="Credit or debt not found")
    validate_credit_debt_transaction(
        db,
        credit_debt_id=item.id,
        txn_type=payment_txn_type(item.direction),
        currency_code=item.currency_code,
        require_active=True,
    )
    pay_cat = payment_category(db, item.direction)
    _add_tagged_transaction(
        db,
        item,
        payload.amount,
        payment_txn_type(item.direction),
        pay_cat.id,
        when=payload.date,
        note=payload.note or f"Payment toward {item.name}",
    )
    db.commit()
    db.refresh(item)
    return _to_out(db, item)


@router.delete("/{credit_debt_id}", status_code=204)
def delete_credit_debt(credit_debt_id: int, db: Session = Depends(get_db)):
    item = db.get(CreditDebt, credit_debt_id)
    if not item:
        raise HTTPException(status_code=404, detail="Credit or debt not found")
    db.query(Transaction).filter(Transaction.credit_debt_id == item.id).update(
        {Transaction.credit_debt_id: None}
    )
    db.delete(item)
    db.commit()
