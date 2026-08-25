from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.currency_utils import require_enabled_currency
from app.database import get_db
from app.models import Goal, GoalContribution, GoalStatus
from app.schemas import GoalContribute, GoalCreate, GoalOut, GoalUpdate

router = APIRouter(prefix="/goals", tags=["goals"])


def _to_out(goal: Goal) -> GoalOut:
    pct = 0.0
    if goal.target_amount > 0:
        pct = min(100.0, round(goal.current_amount / goal.target_amount * 100, 1))
    return GoalOut(
        id=goal.id,
        name=goal.name,
        target_amount=goal.target_amount,
        current_amount=goal.current_amount,
        currency_code=goal.currency_code,
        deadline=goal.deadline,
        status=goal.status,
        created_at=goal.created_at,
        progress_pct=pct,
    )


@router.get("", response_model=list[GoalOut])
def list_goals(db: Session = Depends(get_db)):
    goals = db.query(Goal).order_by(Goal.created_at.desc()).all()
    return [_to_out(g) for g in goals]


@router.post("", response_model=GoalOut, status_code=201)
def create_goal(payload: GoalCreate, db: Session = Depends(get_db)):
    currency_code = require_enabled_currency(db, payload.currency_code)
    status = GoalStatus.active.value
    if payload.current_amount >= payload.target_amount:
        status = GoalStatus.completed.value
    data = payload.model_dump()
    data["currency_code"] = currency_code
    goal = Goal(**data, status=status)
    db.add(goal)
    db.flush()
    if payload.current_amount > 0:
        db.add(
            GoalContribution(
                goal_id=goal.id,
                amount=payload.current_amount,
                currency_code=currency_code,
                date=date.today(),
            )
        )
    db.commit()
    db.refresh(goal)
    return _to_out(goal)


@router.patch("/{goal_id}", response_model=GoalOut)
def update_goal(goal_id: int, payload: GoalUpdate, db: Session = Depends(get_db)):
    goal = db.get(Goal, goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    data = payload.model_dump(exclude_unset=True)
    if "currency_code" in data:
        data["currency_code"] = require_enabled_currency(db, data["currency_code"])
    for key, value in data.items():
        setattr(goal, key, value)
    if goal.current_amount >= goal.target_amount and goal.status == GoalStatus.active.value:
        goal.status = GoalStatus.completed.value
    db.commit()
    db.refresh(goal)
    return _to_out(goal)


@router.post("/{goal_id}/contribute", response_model=GoalOut)
def contribute_to_goal(
    goal_id: int, payload: GoalContribute, db: Session = Depends(get_db)
):
    goal = db.get(Goal, goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    if goal.status != GoalStatus.active.value:
        raise HTTPException(status_code=400, detail="Goal is not active")
    db.add(
        GoalContribution(
            goal_id=goal.id,
            amount=payload.amount,
            currency_code=goal.currency_code,
            date=date.today(),
        )
    )
    goal.current_amount += payload.amount
    if goal.current_amount >= goal.target_amount:
        goal.status = GoalStatus.completed.value
    db.commit()
    db.refresh(goal)
    return _to_out(goal)


@router.delete("/{goal_id}", status_code=204)
def delete_goal(goal_id: int, db: Session = Depends(get_db)):
    goal = db.get(Goal, goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    db.delete(goal)
    db.commit()
