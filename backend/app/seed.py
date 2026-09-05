import json
from datetime import date

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.currency_utils import ensure_currency_row
from app.models import (
    DEFAULT_DASHBOARD_WIDGETS,
    DEFAULT_DASHBOARD_WIDGET_LAYOUT,
    DEFAULT_DASHBOARD_WIDGET_VIEWS,
    DEFAULT_STATS_CHARTS,
    Category,
    CategoryType,
    Currency,
    Goal,
    Settings,
    Transaction,
)

DEFAULT_CATEGORIES = [
    ("Salary", "income", "#2D6A4F"),
    ("Freelance", "income", "#40916C"),
    ("Other Income", "income", "#52B788"),
    ("Deposit return", "income", "#2D6A4F"),
    ("Borrowed", "income", "#40916C"),
    ("Credit repayment", "income", "#2D6A4F"),
    ("Groceries", "expense", "#BC4749"),
    ("Rent", "expense", "#A4161A"),
    ("Utilities", "expense", "#E09F3E"),
    ("Transport", "expense", "#335C81"),
    ("Dining", "expense", "#C1666B"),
    ("Entertainment", "expense", "#7B2D8E"),
    ("Health", "expense", "#1B998B"),
    ("Shopping", "expense", "#D4A373"),
    ("Goals", "expense", "#5B8C5A"),
    ("Lent", "expense", "#335C81"),
    ("Debt payment", "expense", "#A4161A"),
    ("Other Expense", "expense", "#495057"),
]


def _backfill_goal_saved_transactions(db: Session) -> None:
    """Ensure existing goal balances are reflected as tagged expenses."""
    goals = db.query(Goal).all()
    if not goals:
        return
    category = (
        db.query(Category)
        .filter(Category.name == "Goals", Category.type == CategoryType.expense.value)
        .first()
    )
    if category is None:
        return
    for goal in goals:
        recorded = (
            db.query(func.coalesce(func.sum(Transaction.amount), 0))
            .filter(
                Transaction.goal_id == goal.id,
                Transaction.type == CategoryType.expense.value,
            )
            .scalar()
        )
        gap = goal.current_amount - int(recorded or 0)
        if gap > 0:
            contrib_date = goal.created_at.date() if goal.created_at else date.today()
            db.add(
                Transaction(
                    amount=gap,
                    currency_code=goal.currency_code or "USD",
                    date=contrib_date,
                    type=CategoryType.expense.value,
                    category_id=category.id,
                    note=f"Saved toward {goal.name}",
                    goal_id=goal.id,
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
                dashboard_widgets=DEFAULT_DASHBOARD_WIDGETS,
                stats_charts=DEFAULT_STATS_CHARTS,
                dashboard_widget_views=DEFAULT_DASHBOARD_WIDGET_VIEWS,
                dashboard_widget_layout=DEFAULT_DASHBOARD_WIDGET_LAYOUT,
            )
        )
    else:
        if not settings.theme:
            settings.theme = "system"
        if settings.locale is None:
            settings.locale = ""
        if not settings.dashboard_widgets:
            settings.dashboard_widgets = DEFAULT_DASHBOARD_WIDGETS
        if not settings.stats_charts:
            settings.stats_charts = DEFAULT_STATS_CHARTS
        if not settings.dashboard_widget_views:
            settings.dashboard_widget_views = DEFAULT_DASHBOARD_WIDGET_VIEWS
        if not settings.dashboard_widget_layout:
            settings.dashboard_widget_layout = DEFAULT_DASHBOARD_WIDGET_LAYOUT
        if not settings.default_currency_code:
            settings.default_currency_code = default_code
        ensure_currency_row(db, settings.default_currency_code)

    if db.query(Category).count() == 0:
        for name, cat_type, color in DEFAULT_CATEGORIES:
            db.add(Category(name=name, type=cat_type, color=color))
    else:
        extras = [
            ("Deposit return", "income", "#2D6A4F"),
            ("Goals", "expense", "#5B8C5A"),
            ("Borrowed", "income", "#40916C"),
            ("Credit repayment", "income", "#2D6A4F"),
            ("Lent", "expense", "#335C81"),
            ("Debt payment", "expense", "#A4161A"),
        ]
        for name, cat_type, color in extras:
            exists = (
                db.query(Category)
                .filter(Category.name == name, Category.type == cat_type)
                .first()
            )
            if exists is None:
                db.add(Category(name=name, type=cat_type, color=color))

    db.flush()
    _backfill_goal_saved_transactions(db)
    db.commit()


def parse_json_list(raw: str, fallback: list[str]) -> list[str]:
    try:
        data = json.loads(raw) if raw else fallback
        if isinstance(data, list) and all(isinstance(x, str) for x in data):
            return data
    except json.JSONDecodeError:
        pass
    return list(fallback)
