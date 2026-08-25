import json
from datetime import date

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.currency_utils import ensure_currency_row
from app.models import (
    DEFAULT_DASHBOARD_WIDGETS,
    DEFAULT_STATS_CHARTS,
    Category,
    Currency,
    Goal,
    GoalContribution,
    Settings,
)

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
                    currency_code=getattr(goal, "currency_code", None) or "USD",
                    date=contrib_date,
                )
            )


def seed_database(db: Session) -> None:
    default_code = "USD"
    settings = db.query(Settings).first()
    if settings is not None and settings.default_currency_code:
        default_code = settings.default_currency_code

    if db.query(Currency).count() == 0:
        ensure_currency_row(db, default_code)
    else:
        ensure_currency_row(db, default_code)

    if settings is None:
        db.add(
            Settings(
                default_currency_code=default_code,
                theme="system",
                locale="",
                first_day_of_week="monday",
                dashboard_widgets=DEFAULT_DASHBOARD_WIDGETS,
                stats_charts=DEFAULT_STATS_CHARTS,
            )
        )
    else:
        if not settings.theme:
            settings.theme = "system"
        if settings.locale is None:
            settings.locale = ""
        if not settings.first_day_of_week:
            settings.first_day_of_week = "monday"
        if not settings.dashboard_widgets:
            settings.dashboard_widgets = DEFAULT_DASHBOARD_WIDGETS
        if not settings.stats_charts:
            settings.stats_charts = DEFAULT_STATS_CHARTS
        if not settings.default_currency_code:
            settings.default_currency_code = default_code
        ensure_currency_row(db, settings.default_currency_code)

    if db.query(Category).count() == 0:
        for name, cat_type, color in DEFAULT_CATEGORIES:
            db.add(Category(name=name, type=cat_type, color=color))

    _backfill_goal_contributions(db)
    db.commit()


def parse_json_list(raw: str, fallback: list[str]) -> list[str]:
    try:
        data = json.loads(raw) if raw else fallback
        if isinstance(data, list) and all(isinstance(x, str) for x in data):
            return data
    except json.JSONDecodeError:
        pass
    return list(fallback)
