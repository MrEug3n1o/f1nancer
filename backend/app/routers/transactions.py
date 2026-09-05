from calendar import monthrange
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.currency_utils import require_enabled_currency
from app.database import get_db
from app.credit_debt_utils import sync_credit_debt_status, validate_credit_debt_transaction
from app.goal_utils import sync_goal_current_amount, validate_goal_transaction
from app.models import Category, Transaction
from app.schemas import TransactionCreate, TransactionOut, TransactionUpdate

router = APIRouter(prefix="/transactions", tags=["transactions"])


def _month_bounds(month: str) -> tuple[date, date]:
    year, mon = map(int, month.split("-"))
    start = date(year, mon, 1)
    end = date(year, mon, monthrange(year, mon)[1])
    return start, end


@router.get("", response_model=list[TransactionOut])
def list_transactions(
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    category_id: int | None = None,
    type: str | None = None,
    currency: str | None = None,
    goal_id: int | None = None,
    credit_debt_id: int | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(Transaction).options(joinedload(Transaction.category))
    if month:
        start, end = _month_bounds(month)
        q = q.filter(Transaction.date >= start, Transaction.date <= end)
    if category_id is not None:
        q = q.filter(Transaction.category_id == category_id)
    if type:
        q = q.filter(Transaction.type == type)
    if currency:
        q = q.filter(Transaction.currency_code == currency.upper())
    if goal_id is not None:
        q = q.filter(Transaction.goal_id == goal_id)
    if credit_debt_id is not None:
        q = q.filter(Transaction.credit_debt_id == credit_debt_id)
    return q.order_by(Transaction.date.desc(), Transaction.id.desc()).all()


@router.post("", response_model=TransactionOut, status_code=201)
def create_transaction(payload: TransactionCreate, db: Session = Depends(get_db)):
    category = db.get(Category, payload.category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    if category.type != payload.type:
        raise HTTPException(
            status_code=400,
            detail="Category type does not match transaction type",
        )
    data = payload.model_dump()
    data["currency_code"] = require_enabled_currency(db, data["currency_code"])
    if data.get("goal_id") and data.get("credit_debt_id"):
        raise HTTPException(
            status_code=400,
            detail="A transaction cannot be tagged to both a goal and a credit or debt",
        )
    validate_goal_transaction(
        db,
        goal_id=data.get("goal_id"),
        txn_type=data["type"],
        currency_code=data["currency_code"],
        require_active=True,
    )
    validate_credit_debt_transaction(
        db,
        credit_debt_id=data.get("credit_debt_id"),
        txn_type=data["type"],
        currency_code=data["currency_code"],
        require_active=True,
    )
    txn = Transaction(**data)
    db.add(txn)
    db.flush()
    sync_goal_current_amount(db, txn.goal_id)
    sync_credit_debt_status(db, txn.credit_debt_id)
    db.commit()
    db.refresh(txn)
    db.refresh(txn, attribute_names=["category"])
    return txn


@router.patch("/{transaction_id}", response_model=TransactionOut)
def update_transaction(
    transaction_id: int, payload: TransactionUpdate, db: Session = Depends(get_db)
):
    txn = db.get(Transaction, transaction_id)
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    data = payload.model_dump(exclude_unset=True)
    if "currency_code" in data:
        data["currency_code"] = require_enabled_currency(db, data["currency_code"])
    if "category_id" in data or "type" in data:
        category_id = data.get("category_id", txn.category_id)
        txn_type = data.get("type", txn.type)
        category = db.get(Category, category_id)
        if not category:
            raise HTTPException(status_code=404, detail="Category not found")
        if category.type != txn_type:
            raise HTTPException(
                status_code=400,
                detail="Category type does not match transaction type",
            )

    old_goal_id = txn.goal_id
    new_goal_id = data.get("goal_id", txn.goal_id)
    changing_goal = "goal_id" in data and data["goal_id"] != old_goal_id
    old_credit_debt_id = txn.credit_debt_id
    new_credit_debt_id = data.get("credit_debt_id", txn.credit_debt_id)
    changing_credit_debt = (
        "credit_debt_id" in data and data["credit_debt_id"] != old_credit_debt_id
    )
    if (data.get("goal_id", txn.goal_id) and data.get("credit_debt_id", txn.credit_debt_id)):
        raise HTTPException(
            status_code=400,
            detail="A transaction cannot be tagged to both a goal and a credit or debt",
        )
    validate_goal_transaction(
        db,
        goal_id=new_goal_id,
        txn_type=data.get("type", txn.type),
        currency_code=data.get("currency_code", txn.currency_code),
        require_active=bool(changing_goal and new_goal_id is not None),
    )
    validate_credit_debt_transaction(
        db,
        credit_debt_id=new_credit_debt_id,
        txn_type=data.get("type", txn.type),
        currency_code=data.get("currency_code", txn.currency_code),
        require_active=bool(changing_credit_debt and new_credit_debt_id is not None),
    )

    for key, value in data.items():
        setattr(txn, key, value)
    db.flush()
    for gid in {old_goal_id, txn.goal_id}:
        sync_goal_current_amount(db, gid)
    for cid in {old_credit_debt_id, txn.credit_debt_id}:
        sync_credit_debt_status(db, cid)
    db.commit()
    db.refresh(txn)
    db.refresh(txn, attribute_names=["category"])
    return txn


@router.delete("/{transaction_id}", status_code=204)
def delete_transaction(transaction_id: int, db: Session = Depends(get_db)):
    txn = db.get(Transaction, transaction_id)
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    goal_id = txn.goal_id
    credit_debt_id = txn.credit_debt_id
    db.delete(txn)
    db.flush()
    sync_goal_current_amount(db, goal_id)
    sync_credit_debt_status(db, credit_debt_id)
    db.commit()
