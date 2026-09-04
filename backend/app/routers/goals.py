from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.currency_utils import require_enabled_currency
from app.database import get_db
from app.goal_utils import (
    goal_saved_cents,
    goals_expense_category,
    sync_goal_current_amount,
    validate_goal_transaction,
)
from app.models import CategoryType, Goal, GoalStatus, Transaction
from app.schemas import (
    GoalComplete,
    GoalContribute,
    GoalCreate,
    GoalOut,
    GoalUpdate,
    TransactionOut,
)

router = APIRouter(prefix="/goals", tags=["goals"])


def _progress_pct(current_amount: int, target_amount: int) -> float:
    if target_amount <= 0:
        return 0.0
    return min(100.0, round(current_amount / target_amount * 100, 1))


def _goal_transactions(db: Session, goal_id: int) -> list[Transaction]:
    return (
        db.query(Transaction)
        .options(joinedload(Transaction.category))
        .filter(Transaction.goal_id == goal_id)
        .order_by(Transaction.date.desc(), Transaction.id.desc())
        .all()
    )


def _to_out(db: Session, goal: Goal) -> GoalOut:
    saved = goal_saved_cents(db, goal.id)
    goal.current_amount = saved
    txns = _goal_transactions(db, goal.id)
    return GoalOut(
        id=goal.id,
        name=goal.name,
        target_amount=goal.target_amount,
        current_amount=saved,
        currency_code=goal.currency_code,
        deadline=goal.deadline,
        status=goal.status,
        created_at=goal.created_at,
        progress_pct=_progress_pct(saved, goal.target_amount),
        transactions=[TransactionOut.model_validate(t) for t in txns],
    )


def _add_contribution_transaction(
    db: Session,
    goal: Goal,
    amount: int,
    *,
    when: date | None = None,
    category_id: int | None = None,
    note: str | None = None,
) -> Transaction:
    category = goals_expense_category(db, category_id)
    txn = Transaction(
        amount=amount,
        currency_code=goal.currency_code,
        date=when or date.today(),
        type=CategoryType.expense.value,
        category_id=category.id,
        note=note,
        goal_id=goal.id,
    )
    db.add(txn)
    db.flush()
    sync_goal_current_amount(db, goal.id)
    return txn


@router.get("", response_model=list[GoalOut])
def list_goals(db: Session = Depends(get_db)):
    goals = db.query(Goal).order_by(Goal.created_at.desc()).all()
    return [_to_out(db, g) for g in goals]


@router.get("/{goal_id}", response_model=GoalOut)
def get_goal(goal_id: int, db: Session = Depends(get_db)):
    goal = db.get(Goal, goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    return _to_out(db, goal)


@router.post("", response_model=GoalOut, status_code=201)
def create_goal(payload: GoalCreate, db: Session = Depends(get_db)):
    currency_code = require_enabled_currency(db, payload.currency_code)
    starting = payload.current_amount
    goal = Goal(
        name=payload.name,
        target_amount=payload.target_amount,
        current_amount=0,
        currency_code=currency_code,
        deadline=payload.deadline,
        status=GoalStatus.active.value,
    )
    db.add(goal)
    db.flush()
    if starting > 0:
        _add_contribution_transaction(
            db,
            goal,
            starting,
            note=f"Saved toward {goal.name}",
        )
    db.commit()
    db.refresh(goal)
    return _to_out(db, goal)


@router.patch("/{goal_id}", response_model=GoalOut)
def update_goal(goal_id: int, payload: GoalUpdate, db: Session = Depends(get_db)):
    goal = db.get(Goal, goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    data = payload.model_dump(exclude_unset=True)
    if "currency_code" in data:
        data["currency_code"] = require_enabled_currency(db, data["currency_code"])
        tagged = (
            db.query(Transaction)
            .filter(Transaction.goal_id == goal.id)
            .count()
        )
        if tagged and data["currency_code"] != goal.currency_code:
            raise HTTPException(
                status_code=400,
                detail="Cannot change currency while the goal has transactions",
            )

    new_status = data.pop("status", None)
    for key, value in data.items():
        setattr(goal, key, value)

    if new_status == GoalStatus.completed.value:
        if goal.status != GoalStatus.active.value:
            raise HTTPException(status_code=400, detail="Goal is not active")
        goal.status = GoalStatus.completed.value
    elif new_status is not None:
        goal.status = new_status

    db.commit()
    db.refresh(goal)
    return _to_out(db, goal)


@router.post("/{goal_id}/contribute", response_model=GoalOut)
def contribute_to_goal(
    goal_id: int, payload: GoalContribute, db: Session = Depends(get_db)
):
    goal = db.get(Goal, goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    validate_goal_transaction(
        db,
        goal_id=goal.id,
        txn_type=CategoryType.expense.value,
        currency_code=goal.currency_code,
        require_active=True,
    )
    _add_contribution_transaction(
        db,
        goal,
        payload.amount,
        when=payload.date,
        category_id=payload.category_id,
        note=payload.note,
    )
    db.commit()
    db.refresh(goal)
    return _to_out(db, goal)


@router.post("/{goal_id}/complete", response_model=GoalOut)
def complete_goal(
    goal_id: int,
    payload: GoalComplete = GoalComplete(),
    db: Session = Depends(get_db),
):
    del payload
    goal = db.get(Goal, goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    if goal.status != GoalStatus.active.value:
        raise HTTPException(status_code=400, detail="Goal is not active")
    goal.status = GoalStatus.completed.value
    db.commit()
    db.refresh(goal)
    return _to_out(db, goal)


@router.delete("/{goal_id}", status_code=204)
def delete_goal(goal_id: int, db: Session = Depends(get_db)):
    goal = db.get(Goal, goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    db.delete(goal)
    db.commit()
