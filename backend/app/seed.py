from datetime import date

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Category, Goal, GoalContribution, Settings

DEFAULT_CATEGORIES = [
    ("Salary", "income", "#2D6A4F"),
    ("Freelance", "income", "#40916C"),
    ("Other Income", "income", "#52B788"),
    ("Groceries", "expense", "#BC4749"),
    ("Rent", "expense", "#A4161A"),
    ("Utilities", "expense", "#E09F3E"),
    ("Transport", "expense", "#335C81"),
    ("Dining", "expense", "#C1666B"),
    ("Entertainment", "expense", "#7B2D8E"),
    ("Health", "expense", "#1B998B"),
    ("Shopping", "expense", "#D4A373"),
    ("Subscriptions", "expense", "#6C757D"),
    ("Other Expense", "expense", "#495057"),
]


def _backfill_goal_contributions(db: Session) -> None:
    """Ensure existing goal balances are reflected in contribution history."""
    goals = db.query(Goal).all()
    for goal in goals:
        recorded = (
            db.query(func.coalesce(func.sum(GoalContribution.amount), 0))
            .filter(GoalContribution.goal_id == goal.id)
            .scalar()
        )
        gap = goal.current_amount - int(recorded)
        if gap > 0:
            contrib_date = goal.created_at.date() if goal.created_at else date.today()
            db.add(
                GoalContribution(
                    goal_id=goal.id,
                    amount=gap,
                    date=contrib_date,
                )
            )


def seed_database(db: Session) -> None:
    if db.query(Settings).count() == 0:
        db.add(Settings(currency_code="USD"))

    if db.query(Category).count() == 0:
        for name, cat_type, color in DEFAULT_CATEGORIES:
            db.add(Category(name=name, type=cat_type, color=color))

    _backfill_goal_contributions(db)
    db.commit()
