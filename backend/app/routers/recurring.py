from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.currency_utils import require_enabled_currency
from app.database import get_db
from app.models import Category, RecurringRule
from app.schemas import RecurringCreate, RecurringOut, RecurringUpdate
from app.services.recurring import next_billing_date, process_recurring_rules

router = APIRouter(prefix="/recurring", tags=["recurring"])


def _apply_billing_schedule(data: dict, existing: RecurringRule | None = None) -> None:
    cadence = data.get("cadence", existing.cadence if existing else None)
    billing_day = data.get(
        "billing_day", existing.billing_day if existing else 1
    )
    if cadence == "monthly":
        from datetime import date

        data["next_run_date"] = next_billing_date(date.today(), billing_day)
    elif "next_run_date" not in data and existing is None:
        raise HTTPException(
            status_code=400,
            detail="next_run_date is required for weekly and yearly subscriptions",
        )


@router.get("", response_model=list[RecurringOut])
def list_recurring(db: Session = Depends(get_db)):
    return (
        db.query(RecurringRule)
        .options(joinedload(RecurringRule.category))
        .order_by(RecurringRule.next_run_date)
        .all()
    )


@router.post("", response_model=RecurringOut, status_code=201)
def create_recurring(payload: RecurringCreate, db: Session = Depends(get_db)):
    category = db.get(Category, payload.category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    if category.type != payload.type:
        raise HTTPException(
            status_code=400,
            detail="Category type does not match recurring type",
        )
    data = payload.model_dump()
    data["currency_code"] = require_enabled_currency(db, data["currency_code"])
    _apply_billing_schedule(data)
    rule = RecurringRule(**data)
    db.add(rule)
    db.commit()
    db.refresh(rule)
    db.refresh(rule, attribute_names=["category"])
    return rule


@router.patch("/{rule_id}", response_model=RecurringOut)
def update_recurring(
    rule_id: int, payload: RecurringUpdate, db: Session = Depends(get_db)
):
    rule = db.get(RecurringRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Recurring rule not found")
    data = payload.model_dump(exclude_unset=True)
    if "currency_code" in data:
        data["currency_code"] = require_enabled_currency(db, data["currency_code"])
    if "category_id" in data or "type" in data:
        category_id = data.get("category_id", rule.category_id)
        rule_type = data.get("type", rule.type)
        category = db.get(Category, category_id)
        if not category:
            raise HTTPException(status_code=404, detail="Category not found")
        if category.type != rule_type:
            raise HTTPException(
                status_code=400,
                detail="Category type does not match recurring type",
            )
    if "billing_day" in data or "cadence" in data:
        _apply_billing_schedule(data, existing=rule)
    for key, value in data.items():
        setattr(rule, key, value)
    db.commit()
    db.refresh(rule)
    db.refresh(rule, attribute_names=["category"])
    return rule


@router.delete("/{rule_id}", status_code=204)
def delete_recurring(rule_id: int, db: Session = Depends(get_db)):
    rule = db.get(RecurringRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Recurring rule not found")
    db.delete(rule)
    db.commit()


@router.post("/process")
def process_recurring(db: Session = Depends(get_db)):
    created = process_recurring_rules(db)
    return {"created": created}
