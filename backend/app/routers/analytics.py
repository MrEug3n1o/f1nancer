from calendar import monthrange
from datetime import date

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.credit_debt_utils import remaining_cents
from app.database import get_db
from app.deposit_utils import simple_interest_cents
from app.goal_utils import goal_saved_cents
from app.models import (
    Category,
    CreditDebt,
    CreditDebtStatus,
    Deposit,
    DepositStatus,
    DepositType,
    Goal,
    GoalStatus,
    Transaction,
)
from app.schemas import (
    CategorySpend,
    CreditDebtSummaryItem,
    CurrencyMonthSplit,
    CurrencyOverview,
    DepositSummaryItem,
    GoalProgress,
    MoneyLocationCurrencyOverview,
    MoneyLocationOverview,
    MoneyLocationSplit,
    MonthOverview,
    PocketOverview,
    TrendPoint,
)

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _month_bounds(month: str) -> tuple[date, date]:
    year, mon = map(int, month.split("-"))
    start = date(year, mon, 1)
    end = date(year, mon, monthrange(year, mon)[1])
    return start, end


def _sum_by_currency_location(
    db: Session,
    *,
    txn_type: str | None = None,
    deposits: bool = False,
    start: date | None = None,
    end: date | None = None,
) -> dict[tuple[str, str], int]:
    """Map (currency_code, money_location) -> total cents."""
    if deposits:
        q = db.query(
            Deposit.currency_code,
            Deposit.money_location,
            func.coalesce(func.sum(Deposit.principal_cents), 0).label("total"),
        ).filter(Deposit.status != DepositStatus.cancelled.value)
        if start is not None:
            q = q.filter(Deposit.start_date >= start)
        if end is not None:
            q = q.filter(Deposit.start_date <= end)
        rows = q.group_by(Deposit.currency_code, Deposit.money_location).all()
    else:
        q = db.query(
            Transaction.currency_code,
            Transaction.money_location,
            func.coalesce(func.sum(Transaction.amount), 0).label("total"),
        )
        if txn_type is not None:
            q = q.filter(Transaction.type == txn_type)
        if start is not None:
            q = q.filter(Transaction.date >= start)
        if end is not None:
            q = q.filter(Transaction.date <= end)
        rows = q.group_by(Transaction.currency_code, Transaction.money_location).all()

    return {(r.currency_code, r.money_location): int(r.total) for r in rows}


def _currency_net_overviews(
    db: Session,
    start: date | None = None,
    end: date | None = None,
) -> list[CurrencyOverview]:
    income_map = _sum_by_currency_location(
        db, txn_type="income", start=start, end=end
    )
    expense_map = _sum_by_currency_location(
        db, txn_type="expense", start=start, end=end
    )
    deposited_map = _sum_by_currency_location(
        db, deposits=True, start=start, end=end
    )

    codes = sorted(
        {c for c, _ in income_map}
        | {c for c, _ in expense_map}
        | {c for c, _ in deposited_map}
    )

    currencies = []
    for code in codes:
        cash_income = income_map.get((code, "cash"), 0)
        card_income = income_map.get((code, "card"), 0)
        cash_expense = expense_map.get((code, "cash"), 0)
        card_expense = expense_map.get((code, "card"), 0)
        cash_deposited = deposited_map.get((code, "cash"), 0)
        card_deposited = deposited_map.get((code, "card"), 0)
        # Treat unknown locations as card for safety
        other_income = sum(
            v for (c, loc), v in income_map.items() if c == code and loc not in ("cash", "card")
        )
        other_expense = sum(
            v for (c, loc), v in expense_map.items() if c == code and loc not in ("cash", "card")
        )
        other_deposited = sum(
            v
            for (c, loc), v in deposited_map.items()
            if c == code and loc not in ("cash", "card")
        )
        card_income += other_income
        card_expense += other_expense
        card_deposited += other_deposited

        cash_net = cash_income - cash_expense - cash_deposited
        card_net = card_income - card_expense - card_deposited
        income = cash_income + card_income
        expense = cash_expense + card_expense
        deposited = cash_deposited + card_deposited
        currencies.append(
            CurrencyOverview(
                currency_code=code,
                income_cents=income,
                expense_cents=expense,
                net_cents=income - expense - deposited,
                cash_net_cents=cash_net,
                card_net_cents=card_net,
            )
        )
    return currencies


@router.get("/month-overview", response_model=MonthOverview)
def month_overview(
    month: str = Query(pattern=r"^\d{4}-\d{2}$"),
    db: Session = Depends(get_db),
):
    start, end = _month_bounds(month)
    currencies = _currency_net_overviews(db, start, end)
    return MonthOverview(month=month, currencies=currencies)


@router.get("/pocket", response_model=PocketOverview)
def pocket_overview(db: Session = Depends(get_db)):
    return PocketOverview(currencies=_currency_net_overviews(db))


@router.get("/money-location-overview", response_model=MoneyLocationOverview)
def money_location_overview(
    month: str = Query(pattern=r"^\d{4}-\d{2}$"),
    db: Session = Depends(get_db),
):
    start, end = _month_bounds(month)
    income_map = _sum_by_currency_location(
        db, txn_type="income", start=start, end=end
    )
    expense_map = _sum_by_currency_location(
        db, txn_type="expense", start=start, end=end
    )
    codes = sorted(
        {c for c, _ in income_map} | {c for c, _ in expense_map}
    )
    currencies: list[MoneyLocationCurrencyOverview] = []
    for code in codes:
        currencies.append(
            MoneyLocationCurrencyOverview(
                currency_code=code,
                cash=MoneyLocationSplit(
                    income_cents=income_map.get((code, "cash"), 0),
                    expense_cents=expense_map.get((code, "cash"), 0),
                ),
                card=MoneyLocationSplit(
                    income_cents=income_map.get((code, "card"), 0)
                    + sum(
                        v
                        for (c, loc), v in income_map.items()
                        if c == code and loc not in ("cash", "card")
                    ),
                    expense_cents=expense_map.get((code, "card"), 0)
                    + sum(
                        v
                        for (c, loc), v in expense_map.items()
                        if c == code and loc not in ("cash", "card")
                    ),
                ),
            )
        )
    return MoneyLocationOverview(month=month, currencies=currencies)


@router.get("/spend-by-category", response_model=list[CategorySpend])
def spend_by_category(
    month: str = Query(pattern=r"^\d{4}-\d{2}$"),
    currency: str | None = None,
    db: Session = Depends(get_db),
):
    start, end = _month_bounds(month)
    q = (
        db.query(
            Category.id,
            Category.name,
            Category.color,
            Transaction.currency_code,
            func.coalesce(func.sum(Transaction.amount), 0).label("total"),
        )
        .join(Transaction, Transaction.category_id == Category.id)
        .filter(
            Transaction.type == "expense",
            Transaction.date >= start,
            Transaction.date <= end,
        )
    )
    if currency:
        q = q.filter(Transaction.currency_code == currency.upper())
    rows = (
        q.group_by(Category.id, Category.name, Category.color, Transaction.currency_code)
        .order_by(func.sum(Transaction.amount).desc())
        .all()
    )
    return [
        CategorySpend(
            category_id=row.id,
            category_name=row.name,
            color=row.color,
            currency_code=row.currency_code,
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
        saved = goal_saved_cents(db, goal.id)
        pct = 0.0
        if goal.target_amount > 0:
            pct = min(100.0, round(saved / goal.target_amount * 100, 1))
        result.append(
            GoalProgress(
                id=goal.id,
                name=goal.name,
                target_amount=goal.target_amount,
                current_amount=saved,
                currency_code=goal.currency_code,
                progress_pct=pct,
                status=goal.status,
                deadline=goal.deadline,
            )
        )
    return result


@router.get("/deposits-summary", response_model=list[DepositSummaryItem])
def deposits_summary(db: Session = Depends(get_db)):
    deposits = (
        db.query(Deposit)
        .filter(Deposit.status == DepositStatus.active.value)
        .order_by(Deposit.currency_code)
        .all()
    )
    bucket: dict[str, dict[str, int]] = {}
    for deposit in deposits:
        if deposit.currency_code not in bucket:
            bucket[deposit.currency_code] = {
                "active_count": 0,
                "principal_cents": 0,
                "current_value_cents": 0,
            }
        accrued = 0
        if (
            deposit.type == DepositType.bank.value
            and deposit.annual_rate_bps is not None
        ):
            accrued = simple_interest_cents(
                deposit.principal_cents,
                deposit.annual_rate_bps,
                deposit.start_date,
                deposit.end_date,
            )
        bucket[deposit.currency_code]["active_count"] += 1
        bucket[deposit.currency_code]["principal_cents"] += deposit.principal_cents
        bucket[deposit.currency_code]["current_value_cents"] += (
            deposit.principal_cents + accrued
        )

    return [
        DepositSummaryItem(
            currency_code=code,
            active_count=vals["active_count"],
            principal_cents=vals["principal_cents"],
            current_value_cents=vals["current_value_cents"],
        )
        for code, vals in sorted(bucket.items())
    ]


@router.get("/credits-debts-summary", response_model=list[CreditDebtSummaryItem])
def credits_debts_summary(db: Session = Depends(get_db)):
    items = (
        db.query(CreditDebt)
        .filter(CreditDebt.status == CreditDebtStatus.active.value)
        .order_by(CreditDebt.currency_code)
        .all()
    )
    bucket: dict[str, dict[str, int]] = {}
    for item in items:
        if item.currency_code not in bucket:
            bucket[item.currency_code] = {
                "credit_count": 0,
                "debt_count": 0,
                "credit_remaining_cents": 0,
                "debt_remaining_cents": 0,
            }
        remaining = remaining_cents(db, item)
        if item.direction == "credit":
            bucket[item.currency_code]["credit_count"] += 1
            bucket[item.currency_code]["credit_remaining_cents"] += remaining
        else:
            bucket[item.currency_code]["debt_count"] += 1
            bucket[item.currency_code]["debt_remaining_cents"] += remaining

    return [
        CreditDebtSummaryItem(
            currency_code=code,
            credit_count=vals["credit_count"],
            debt_count=vals["debt_count"],
            credit_remaining_cents=vals["credit_remaining_cents"],
            debt_remaining_cents=vals["debt_remaining_cents"],
        )
        for code, vals in sorted(bucket.items())
    ]


@router.get("/trends", response_model=list[TrendPoint])
def trends(
    months: int = Query(default=12, ge=1, le=36),
    db: Session = Depends(get_db),
):
    today = date.today()
    start_month = date(today.year, today.month, 1) - relativedelta(months=months - 1)
    end = date(today.year, today.month, monthrange(today.year, today.month)[1])

    rows = (
        db.query(
            Transaction.currency_code,
            Transaction.type,
            func.strftime("%Y-%m", Transaction.date).label("month"),
            func.coalesce(func.sum(Transaction.amount), 0).label("total"),
        )
        .filter(Transaction.date >= start_month, Transaction.date <= end)
        .group_by(
            Transaction.currency_code,
            Transaction.type,
            func.strftime("%Y-%m", Transaction.date),
        )
        .all()
    )

    bucket: dict[tuple[str, str], dict[str, int]] = {}
    for row in rows:
        key = (row.month, row.currency_code)
        if key not in bucket:
            bucket[key] = {"income": 0, "expense": 0}
        if row.type == "income":
            bucket[key]["income"] = int(row.total)
        elif row.type == "expense":
            bucket[key]["expense"] = int(row.total)

    points = [
        TrendPoint(
            month=month,
            currency_code=code,
            income_cents=vals["income"],
            expense_cents=vals["expense"],
        )
        for (month, code), vals in bucket.items()
    ]
    points.sort(key=lambda p: (p.month, p.currency_code))
    return points


@router.get("/by-currency", response_model=list[CurrencyMonthSplit])
def by_currency(
    month: str = Query(pattern=r"^\d{4}-\d{2}$"),
    db: Session = Depends(get_db),
):
    start, end = _month_bounds(month)
    rows = (
        db.query(
            Transaction.currency_code,
            Transaction.type,
            func.coalesce(func.sum(Transaction.amount), 0).label("total"),
        )
        .filter(Transaction.date >= start, Transaction.date <= end)
        .group_by(Transaction.currency_code, Transaction.type)
        .all()
    )
    bucket: dict[str, dict[str, int]] = {}
    for row in rows:
        if row.currency_code not in bucket:
            bucket[row.currency_code] = {"income": 0, "expense": 0}
        if row.type == "income":
            bucket[row.currency_code]["income"] = int(row.total)
        elif row.type == "expense":
            bucket[row.currency_code]["expense"] = int(row.total)

    return [
        CurrencyMonthSplit(
            currency_code=code,
            income_cents=vals["income"],
            expense_cents=vals["expense"],
        )
        for code, vals in sorted(bucket.items())
    ]
