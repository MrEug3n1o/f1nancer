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
    date: Mapped[date] = mapped_column(Date, nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    recurring_id: Mapped[int | None] = mapped_column(
        ForeignKey("recurring_rules.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )

    category: Mapped["Category"] = relationship(back_populates="transactions")
    recurring_rule: Mapped["RecurringRule | None"] = relationship(
        back_populates="transactions"
    )


class Budget(Base):
    __tablename__ = "budgets"
    __table_args__ = (
        UniqueConstraint("category_id", "month", name="uq_budget_category_month"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"), nullable=False)
    limit_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[str] = mapped_column(String(7), nullable=False)  # YYYY-MM

    category: Mapped["Category"] = relationship(back_populates="budgets")


class Goal(Base):
    __tablename__ = "goals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    target_amount: Mapped[int] = mapped_column(Integer, nullable=False)  # cents
    current_amount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    deadline: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=GoalStatus.active.value
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )

    contributions: Mapped[list["GoalContribution"]] = relationship(
        back_populates="goal", cascade="all, delete-orphan"
    )


class GoalContribution(Base):
    __tablename__ = "goal_contributions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    goal_id: Mapped[int] = mapped_column(ForeignKey("goals.id"), nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)  # cents
    date: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )

    goal: Mapped["Goal"] = relationship(back_populates="contributions")


class RecurringRule(Base):
    __tablename__ = "recurring_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"), nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    cadence: Mapped[str] = mapped_column(String(20), nullable=False)
    next_run_date: Mapped[date] = mapped_column(Date, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
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
    currency_code: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
