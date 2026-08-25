from datetime import date

from dateutil.relativedelta import relativedelta
from sqlalchemy.orm import Session

from app.models import RecurringRule, Transaction


def advance_date(current: date, cadence: str) -> date:
    if cadence == "weekly":
        return current + relativedelta(weeks=1)
    if cadence == "monthly":
        return current + relativedelta(months=1)
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
            run_date = advance_date(run_date, rule.cadence)
        rule.next_run_date = run_date

    if created:
        db.commit()
    return created
