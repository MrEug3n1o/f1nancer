from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.currency_utils import ensure_currency_row
from app.database import get_db
from app.iso_currencies import ISO_CURRENCIES, is_valid_iso_code, normalize_code
from app.models import (
    Budget,
    Currency,
    Goal,
    GoalContribution,
    RecurringRule,
    Settings,
    Transaction,
)
from app.schemas import CurrencyCatalogItem, CurrencyCreate, CurrencyOut

router = APIRouter(prefix="/currencies", tags=["currencies"])


@router.get("", response_model=list[CurrencyOut])
def list_currencies(db: Session = Depends(get_db)):
    return db.query(Currency).order_by(Currency.code).all()


@router.get("/catalog", response_model=list[CurrencyCatalogItem])
def currency_catalog():
    return [
        CurrencyCatalogItem(code=code, name=name)
        for code, name in sorted(ISO_CURRENCIES.items())
    ]


@router.post("", response_model=CurrencyOut, status_code=201)
def add_currency(payload: CurrencyCreate, db: Session = Depends(get_db)):
    code = normalize_code(payload.code)
    if not is_valid_iso_code(code):
        raise HTTPException(status_code=400, detail=f"Unknown currency code: {code}")
    existing = db.get(Currency, code)
    if existing:
        raise HTTPException(status_code=400, detail=f"Currency {code} is already enabled")
    currency = ensure_currency_row(db, code)
    db.commit()
    db.refresh(currency)
    return currency


@router.delete("/{code}", status_code=204)
def delete_currency(code: str, db: Session = Depends(get_db)):
    normalized = normalize_code(code)
    currency = db.get(Currency, normalized)
    if not currency:
        raise HTTPException(status_code=404, detail="Currency not found")

    settings = db.query(Settings).first()
    if settings and settings.default_currency_code == normalized:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete the default currency. Change the default first.",
        )

    txn_count = (
        db.query(func.count(Transaction.id))
        .filter(Transaction.currency_code == normalized)
        .scalar()
    )
    rule_count = (
        db.query(func.count(RecurringRule.id))
        .filter(RecurringRule.currency_code == normalized)
        .scalar()
    )
    budget_count = (
        db.query(func.count(Budget.id)).filter(Budget.currency_code == normalized).scalar()
    )
    goal_count = (
        db.query(func.count(Goal.id)).filter(Goal.currency_code == normalized).scalar()
    )
    contrib_count = (
        db.query(func.count(GoalContribution.id))
        .filter(GoalContribution.currency_code == normalized)
        .scalar()
    )

    if any(c > 0 for c in (txn_count, rule_count, budget_count, goal_count, contrib_count)):
        raise HTTPException(
            status_code=409,
            detail=(
                f"Currency {normalized} is in use "
                f"({txn_count} transactions, {rule_count} subscriptions, "
                f"{budget_count} budgets, {goal_count} goals, "
                f"{contrib_count} contributions). Remove those first."
            ),
        )

    if db.query(Currency).count() <= 1:
        raise HTTPException(
            status_code=409,
            detail="At least one currency must remain enabled.",
        )

    db.delete(currency)
    db.commit()
