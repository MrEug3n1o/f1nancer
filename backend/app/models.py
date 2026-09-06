from datetime import date, datetime
from enum import Enum

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class CategoryType(str, Enum):
    income = "income"
    expense = "expense"


class Cadence(str, Enum):
    weekly = "weekly"
    monthly = "monthly"
    yearly = "yearly"


class GoalStatus(str, Enum):
    active = "active"
    completed = "completed"
    cancelled = "cancelled"


class DepositType(str, Enum):
    bank = "bank"
    rental = "rental"


class DepositStatus(str, Enum):
    active = "active"
    matured = "matured"
    returned = "returned"
    cancelled = "cancelled"


class CreditDebtDirection(str, Enum):
    credit = "credit"
    debt = "debt"


class CreditDebtSource(str, Enum):
    bank = "bank"
    informal = "informal"


class CreditDebtStatus(str, Enum):
    active = "active"
    paid = "paid"
    cancelled = "cancelled"


class MoneyLocation(str, Enum):
    cash = "cash"
    card = "card"


DEFAULT_DASHBOARD_WIDGETS = (
    '["pocket","overview","money_location","spend_by_category","budgets","goals","deposits","credits_debts"]'
)
DEFAULT_STATS_CHARTS = '["trends","spend_by_category","by_currency"]'
DEFAULT_DASHBOARD_WIDGET_VIEWS = "{}"
DEFAULT_DASHBOARD_WIDGET_LAYOUT = (
    '[{"id":"pocket","span":2,"col":0},{"id":"overview","span":1,"col":0},'
    '{"id":"money_location","span":1,"col":1},'
    '{"id":"spend_by_category","span":1,"col":0},{"id":"budgets","span":1,"col":1},'
    '{"id":"category_table","span":2,"col":0},{"id":"goals","span":2,"col":0},'
    '{"id":"deposits","span":2,"col":0},{"id":"credits_debts","span":2,"col":0}]'
)


class Currency(Base):
    __tablename__ = "currencies"

    code: Mapped[str] = mapped_column(String(3), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    color: Mapped[str] = mapped_column(String(20), nullable=False, default="#5B8C5A")

    transactions: Mapped[list["Transaction"]] = relationship(back_populates="category")
    budgets: Mapped[list["Budget"]] = relationship(back_populates="category")
    recurring_rules: Mapped[list["RecurringRule"]] = relationship(
        back_populates="category"
    )


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)  # cents
    currency_code: Mapped[str] = mapped_column(
        String(3), ForeignKey("currencies.code"), nullable=False, default="USD"
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    recurring_id: Mapped[int | None] = mapped_column(
        ForeignKey("recurring_rules.id"), nullable=True
    )
    goal_id: Mapped[int | None] = mapped_column(
        ForeignKey("goals.id", ondelete="SET NULL"), nullable=True
    )
    credit_debt_id: Mapped[int | None] = mapped_column(
        ForeignKey("credit_debts.id", ondelete="SET NULL"), nullable=True
    )
    money_location: Mapped[str] = mapped_column(
        String(10), nullable=False, default=MoneyLocation.card.value
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )

    category: Mapped["Category"] = relationship(back_populates="transactions")
    recurring_rule: Mapped["RecurringRule | None"] = relationship(
        back_populates="transactions"
    )
    goal: Mapped["Goal | None"] = relationship(back_populates="transactions")
    credit_debt: Mapped["CreditDebt | None"] = relationship(
        back_populates="transactions"
    )


class Budget(Base):
    __tablename__ = "budgets"
    __table_args__ = (
        UniqueConstraint(
            "category_id",
            "currency_code",
            name="uq_budget_category_currency",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"), nullable=False)
    limit_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    currency_code: Mapped[str] = mapped_column(
        String(3), ForeignKey("currencies.code"), nullable=False, default="USD"
    )

    category: Mapped["Category"] = relationship(back_populates="budgets")


class Goal(Base):
    __tablename__ = "goals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    target_amount: Mapped[int] = mapped_column(Integer, nullable=False)  # cents
    current_amount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    currency_code: Mapped[str] = mapped_column(
        String(3), ForeignKey("currencies.code"), nullable=False, default="USD"
    )
    deadline: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=GoalStatus.active.value
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )

    transactions: Mapped[list["Transaction"]] = relationship(
        back_populates="goal"
    )


class Deposit(Base):
    __tablename__ = "deposits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    principal_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    currency_code: Mapped[str] = mapped_column(
        String(3), ForeignKey("currencies.code"), nullable=False, default="USD"
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    annual_rate_bps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    counterparty: Mapped[str | None] = mapped_column(String(200), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=DepositStatus.active.value
    )
    money_location: Mapped[str] = mapped_column(
        String(10), nullable=False, default=MoneyLocation.card.value
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )


class CreditDebt(Base):
    __tablename__ = "credit_debts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    direction: Mapped[str] = mapped_column(String(20), nullable=False)
    source: Mapped[str] = mapped_column(String(20), nullable=False)
    principal_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    currency_code: Mapped[str] = mapped_column(
        String(3), ForeignKey("currencies.code"), nullable=False, default="USD"
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    annual_rate_bps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    counterparty: Mapped[str | None] = mapped_column(String(200), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=CreditDebtStatus.active.value
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )

    transactions: Mapped[list["Transaction"]] = relationship(
        back_populates="credit_debt"
    )


class RecurringRule(Base):
    __tablename__ = "recurring_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    currency_code: Mapped[str] = mapped_column(
        String(3), ForeignKey("currencies.code"), nullable=False, default="USD"
    )
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"), nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    cadence: Mapped[str] = mapped_column(String(20), nullable=False)
    billing_day: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    next_run_date: Mapped[date] = mapped_column(Date, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    money_location: Mapped[str] = mapped_column(
        String(10), nullable=False, default=MoneyLocation.card.value
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )

    category: Mapped["Category"] = relationship(back_populates="recurring_rules")
    transactions: Mapped[list["Transaction"]] = relationship(
        back_populates="recurring_rule"
    )


class Settings(Base):
    __tablename__ = "settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    default_currency_code: Mapped[str] = mapped_column(
        String(3), ForeignKey("currencies.code"), nullable=False, default="USD"
    )
    theme: Mapped[str] = mapped_column(String(20), nullable=False, default="system")
    locale: Mapped[str] = mapped_column(String(20), nullable=False, default="")
    dashboard_widgets: Mapped[str] = mapped_column(
        Text, nullable=False, default=DEFAULT_DASHBOARD_WIDGETS
    )
    stats_charts: Mapped[str] = mapped_column(
        Text, nullable=False, default=DEFAULT_STATS_CHARTS
    )
    dashboard_widget_views: Mapped[str] = mapped_column(
        Text, nullable=False, default=DEFAULT_DASHBOARD_WIDGET_VIEWS
    )
    dashboard_widget_layout: Mapped[str] = mapped_column(
        Text, nullable=False, default=DEFAULT_DASHBOARD_WIDGET_LAYOUT
    )
