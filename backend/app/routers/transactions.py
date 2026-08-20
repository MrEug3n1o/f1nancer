from calendar import monthrange
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
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
    txn = Transaction(**payload.model_dump())
    db.add(txn)
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
    for key, value in data.items():
        setattr(txn, key, value)
    db.commit()
    db.refresh(txn)
    db.refresh(txn, attribute_names=["category"])
    return txn


@router.delete("/{transaction_id}", status_code=204)
def delete_transaction(transaction_id: int, db: Session = Depends(get_db)):
    txn = db.get(Transaction, transaction_id)
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    db.delete(txn)
    db.commit()
