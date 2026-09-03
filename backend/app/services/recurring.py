import calendar
from datetime import date

from dateutil.relativedelta import relativedelta
from sqlalchemy.orm import Session

from app.models import RecurringRule, Transaction


def billing_date_in_month(year: int, month: int, billing_day: int) -> date:
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(billing_day, last_day))


def next_billing_date(from_date: date, billing_day: int) -> date:
    candidate = billing_date_in_month(from_date.year, from_date.month, billing_day)
    if candidate >= from_date:
        return candidate
    next_month = from_date + relativedelta(months=1)
    return billing_date_in_month(next_month.year, next_month.month, billing_day)


def advance_date(current: date, cadence: str, billing_day: int = 1) -> date:
    if cadence == "weekly":
        return current + relativedelta(weeks=1)
    if cadence == "monthly":
        next_month = current + relativedelta(months=1)
        return billing_date_in_month(next_month.year, next_month.month, billing_day)
    if cadence == "yearly":
        return current + relativedelta(years=1)
    raise ValueError(f"Unknown cadence: {cadence}")


def process_recurring_rules(db: Session, today: date | None = None) -> int:
    """Create due transactions for active recurring rules. Returns count created."""
    today = today or date.today()
    created = 0
    rules = (
        db.query(RecurringRule)
        .filter(RecurringRule.active.is_(True), RecurringRule.next_run_date <= today)
        .all()
    )

    for rule in rules:
        run_date = rule.next_run_date
        while run_date <= today:
            db.add(
                Transaction(
                    amount=rule.amount,
                    currency_code=rule.currency_code,
                    date=run_date,
                    type=rule.type,
                    category_id=rule.category_id,
                    note=rule.note,
                    recurring_id=rule.id,
                )
            )
            created += 1
            run_date = advance_date(run_date, rule.cadence, rule.billing_day)
        rule.next_run_date = run_date

    if created:
        db.commit()
    return created
