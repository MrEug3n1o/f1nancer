from calendar import monthrange
from datetime import date

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.deposit_utils import simple_interest_cents
from app.models import (
    Category,
    Deposit,
    DepositStatus,
    DepositType,
    Goal,
    GoalContribution,
    GoalStatus,
    Transaction,
)
from app.schemas import (
    CategorySpend,
    CurrencyMonthSplit,
    CurrencyOverview,
    DepositSummaryItem,
    GoalProgress,
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


def _currency_net_overviews(
    db: Session,
    start: date | None = None,
    end: date | None = None,
) -> list[CurrencyOverview]:
    income_q = db.query(
        Transaction.currency_code,
        func.coalesce(func.sum(Transaction.amount), 0).label("total"),
    ).filter(Transaction.type == "income")
    expense_q = db.query(
        Transaction.currency_code,
        func.coalesce(func.sum(Transaction.amount), 0).label("total"),
    ).filter(Transaction.type == "expense")
    goal_spend_q = db.query(
        Transaction.currency_code,
        func.coalesce(func.sum(Transaction.amount), 0).label("total"),
    ).filter(
        Transaction.type == "expense",
        Transaction.goal_id.isnot(None),
    )
    saved_q = db.query(
        GoalContribution.currency_code,
        func.coalesce(func.sum(GoalContribution.amount), 0).label("total"),
    )
    deposited_q = db.query(
        Deposit.currency_code,
        func.coalesce(func.sum(Deposit.principal_cents), 0).label("total"),
    ).filter(Deposit.status != DepositStatus.cancelled.value)

    if start is not None:
        income_q = income_q.filter(Transaction.date >= start)
        expense_q = expense_q.filter(Transaction.date >= start)
        goal_spend_q = goal_spend_q.filter(Transaction.date >= start)
        saved_q = saved_q.filter(GoalContribution.date >= start)
        deposited_q = deposited_q.filter(Deposit.start_date >= start)
    if end is not None:
        income_q = income_q.filter(Transaction.date <= end)
        expense_q = expense_q.filter(Transaction.date <= end)
        goal_spend_q = goal_spend_q.filter(Transaction.date <= end)
        saved_q = saved_q.filter(GoalContribution.date <= end)
        deposited_q = deposited_q.filter(Deposit.start_date <= end)

    income_rows = income_q.group_by(Transaction.currency_code).all()
    expense_rows = expense_q.group_by(Transaction.currency_code).all()
    goal_spend_rows = goal_spend_q.group_by(Transaction.currency_code).all()
    saved_rows = saved_q.group_by(GoalContribution.currency_code).all()
    deposited_rows = deposited_q.group_by(Deposit.currency_code).all()

    income_map = {r.currency_code: int(r.total) for r in income_rows}
    expense_map = {r.currency_code: int(r.total) for r in expense_rows}
    goal_spend_map = {r.currency_code: int(r.total) for r in goal_spend_rows}
    saved_map = {r.currency_code: int(r.total) for r in saved_rows}
    deposited_map = {r.currency_code: int(r.total) for r in deposited_rows}
    codes = sorted(
        set(income_map)
        | set(expense_map)
        | set(saved_map)
        | set(deposited_map)
        | set(goal_spend_map)
    )

    currencies = []
    for code in codes:
        income = income_map.get(code, 0)
        expense = expense_map.get(code, 0)
        saved = saved_map.get(code, 0)
        deposited = deposited_map.get(code, 0)
        goal_spend = goal_spend_map.get(code, 0)
        currencies.append(
            CurrencyOverview(
                currency_code=code,
                income_cents=income,
                expense_cents=expense,
                net_cents=income - expense - saved - deposited + goal_spend,
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
        pct = 0.0
        if goal.target_amount > 0:
            pct = min(100.0, round(goal.current_amount / goal.target_amount * 100, 1))
        result.append(
            GoalProgress(
                id=goal.id,
                name=goal.name,
                target_amount=goal.target_amount,
                current_amount=goal.current_amount,
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
