from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Category, CategoryType, Goal, GoalStatus, Transaction

GOALS_CATEGORY_NAME = "Goals"
GOALS_CATEGORY_COLOR = "#5B8C5A"


def goals_expense_category(db: Session, category_id: int | None = None) -> Category:
    if category_id is not None:
        category = db.get(Category, category_id)
        if not category:
            raise HTTPException(status_code=404, detail="Category not found")
        if category.type != CategoryType.expense.value:
            raise HTTPException(
                status_code=400, detail="Goal contributions require an expense category"
            )
        return category

    category = (
        db.query(Category)
        .filter(
            Category.name == GOALS_CATEGORY_NAME,
            Category.type == CategoryType.expense.value,
        )
        .first()
    )
    if category:
        return category

    category = Category(
        name=GOALS_CATEGORY_NAME,
        type=CategoryType.expense.value,
        color=GOALS_CATEGORY_COLOR,
    )
    db.add(category)
    db.flush()
    return category


def goal_saved_cents(db: Session, goal_id: int) -> int:
    total = (
        db.query(func.coalesce(func.sum(Transaction.amount), 0))
        .filter(
            Transaction.goal_id == goal_id,
            Transaction.type == CategoryType.expense.value,
        )
        .scalar()
    )
    return int(total or 0)


def sync_goal_current_amount(db: Session, goal_id: int | None) -> None:
    if not goal_id:
        return
    goal = db.get(Goal, goal_id)
    if not goal:
        return
    goal.current_amount = goal_saved_cents(db, goal_id)


def validate_goal_transaction(
    db: Session,
    *,
    goal_id: int | None,
    txn_type: str,
    currency_code: str,
    require_active: bool = True,
) -> Goal | None:
    if goal_id is None:
        return None
    goal = db.get(Goal, goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    if require_active and goal.status != GoalStatus.active.value:
        raise HTTPException(status_code=400, detail="Goal is not active")
    if txn_type != CategoryType.expense.value:
        raise HTTPException(
            status_code=400, detail="Goal contributions must be expenses"
        )
    if currency_code != goal.currency_code:
        raise HTTPException(
            status_code=400, detail="Transaction currency must match the goal"
        )
    return goal
