from calendar import monthrange
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.currency_utils import require_enabled_currency
from app.database import get_db
from app.models import Budget, Category, Transaction
from app.schemas import BudgetCreate, BudgetOut, BudgetUpdate

router = APIRouter(prefix="/budgets", tags=["budgets"])


def _current_month() -> str:
    return date.today().strftime("%Y-%m")


def _spent_for_budget(
    db: Session, category_id: int, month: str, currency_code: str
) -> int:
    year, mon = map(int, month.split("-"))
    start = date(year, mon, 1)
    end = date(year, mon, monthrange(year, mon)[1])
    total = (
        db.query(func.coalesce(func.sum(Transaction.amount), 0))
        .filter(
            Transaction.category_id == category_id,
            Transaction.type == "expense",
            Transaction.currency_code == currency_code,
            Transaction.date >= start,
            Transaction.date <= end,
        )
        .scalar()
    )
    return int(total)


def _to_out(db: Session, budget: Budget, month: str) -> BudgetOut:
    return BudgetOut(
        id=budget.id,
        category_id=budget.category_id,
        limit_cents=budget.limit_cents,
        month=month,
        currency_code=budget.currency_code,
        category=budget.category,
        spent_cents=_spent_for_budget(
            db, budget.category_id, month, budget.currency_code
        ),
    )


def _require_expense_category(db: Session, category_id: int) -> Category:
    category = db.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    if category.type != "expense":
        raise HTTPException(status_code=400, detail="Budgets require expense categories")
    return category


def _existing_budget(
    db: Session,
    category_id: int,
    currency_code: str,
    exclude_id: int | None = None,
) -> Budget | None:
    q = db.query(Budget).filter(
        Budget.category_id == category_id,
        Budget.currency_code == currency_code,
    )
    if exclude_id is not None:
        q = q.filter(Budget.id != exclude_id)
    return q.first()


@router.get("", response_model=list[BudgetOut])
def list_budgets(
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    db: Session = Depends(get_db),
):
    view_month = month or _current_month()
    budgets = (
        db.query(Budget)
        .options(joinedload(Budget.category))
        .order_by(Budget.id)
        .all()
    )
    return [_to_out(db, b, view_month) for b in budgets]


@router.post("", response_model=BudgetOut, status_code=201)
def create_budget(
    payload: BudgetCreate,
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    db: Session = Depends(get_db),
):
    _require_expense_category(db, payload.category_id)
    currency_code = require_enabled_currency(db, payload.currency_code)
    if _existing_budget(db, payload.category_id, currency_code):
        raise HTTPException(
            status_code=400,
            detail="A monthly budget already exists for this category and currency",
        )
    data = payload.model_dump()
    data["currency_code"] = currency_code
    budget = Budget(**data)
    db.add(budget)
    db.commit()
    db.refresh(budget)
    db.refresh(budget, attribute_names=["category"])
    return _to_out(db, budget, month or _current_month())


@router.patch("/{budget_id}", response_model=BudgetOut)
def update_budget(
    budget_id: int,
    payload: BudgetUpdate,
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    db: Session = Depends(get_db),
):
    budget = db.get(Budget, budget_id)
    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found")
    data = payload.model_dump(exclude_unset=True)
    if "category_id" in data:
        _require_expense_category(db, data["category_id"])
    if "currency_code" in data:
        data["currency_code"] = require_enabled_currency(db, data["currency_code"])
    next_category_id = data.get("category_id", budget.category_id)
    next_currency = data.get("currency_code", budget.currency_code)
    if _existing_budget(db, next_category_id, next_currency, exclude_id=budget.id):
        raise HTTPException(
            status_code=400,
            detail="A monthly budget already exists for this category and currency",
        )
    for key, value in data.items():
        setattr(budget, key, value)
    db.commit()
    db.refresh(budget)
    db.refresh(budget, attribute_names=["category"])
    return _to_out(db, budget, month or _current_month())


@router.delete("/{budget_id}", status_code=204)
def delete_budget(budget_id: int, db: Session = Depends(get_db)):
    budget = db.get(Budget, budget_id)
    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found")
    db.delete(budget)
    db.commit()
