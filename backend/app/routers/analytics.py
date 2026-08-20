from calendar import monthrange
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Category, Goal, GoalContribution, GoalStatus, Transaction
from app.schemas import CategorySpend, GoalProgress, MonthOverview

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _month_bounds(month: str) -> tuple[date, date]:
    year, mon = map(int, month.split("-"))
    start = date(year, mon, 1)
    end = date(year, mon, monthrange(year, mon)[1])
    return start, end


@router.get("/month-overview", response_model=MonthOverview)
def month_overview(
    month: str = Query(pattern=r"^\d{4}-\d{2}$"),
    db: Session = Depends(get_db),
):
    start, end = _month_bounds(month)
    income = (
        db.query(func.coalesce(func.sum(Transaction.amount), 0))
        .filter(
            Transaction.type == "income",
            Transaction.date >= start,
            Transaction.date <= end,
        )
        .scalar()
    )
    expense = (
        db.query(func.coalesce(func.sum(Transaction.amount), 0))
        .filter(
            Transaction.type == "expense",
            Transaction.date >= start,
            Transaction.date <= end,
        )
        .scalar()
    )
    saved = (
        db.query(func.coalesce(func.sum(GoalContribution.amount), 0))
        .filter(
            GoalContribution.date >= start,
            GoalContribution.date <= end,
        )
        .scalar()
    )
    income_cents = int(income)
    expense_cents = int(expense)
    saved_cents = int(saved)
    # Real net = cash left after spending and allocating to goals
    return MonthOverview(
        month=month,
        income_cents=income_cents,
        expense_cents=expense_cents,
        net_cents=income_cents - expense_cents - saved_cents,
    )


@router.get("/spend-by-category", response_model=list[CategorySpend])
def spend_by_category(
    month: str = Query(pattern=r"^\d{4}-\d{2}$"),
    db: Session = Depends(get_db),
):
    start, end = _month_bounds(month)
    rows = (
        db.query(
            Category.id,
            Category.name,
            Category.color,
            func.coalesce(func.sum(Transaction.amount), 0).label("total"),
        )
        .join(Transaction, Transaction.category_id == Category.id)
        .filter(
            Transaction.type == "expense",
            Transaction.date >= start,
            Transaction.date <= end,
        )
        .group_by(Category.id, Category.name, Category.color)
        .order_by(func.sum(Transaction.amount).desc())
        .all()
    )
    return [
        CategorySpend(
            category_id=row.id,
            category_name=row.name,
            color=row.color,
            total_cents=int(row.total),
        )
        for row in rows
    ]


@router.get("/goals-progress", response_model=list[GoalProgress])
def goals_progress(db: Session = Depends(get_db)):
    goals = (
        db.query(Goal)
        .filter(Goal.status != GoalStatus.cancelled.value)
        .order_by(Goal.created_at.desc())
        .all()
    )
    result = []
    for goal in goals:
        pct = 0.0
        if goal.target_amount > 0:
            pct = min(100.0, round(goal.current_amount / goal.target_amount * 100, 1))
        result.append(
            GoalProgress(
                id=goal.id,
                name=goal.name,
                target_amount=goal.target_amount,
                current_amount=goal.current_amount,
                progress_pct=pct,
                status=goal.status,
                deadline=goal.deadline,
            )
        )
    return result
