from datetime import date as Date
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    type: Literal["income", "expense"]
    color: str = "#5B8C5A"


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    type: Literal["income", "expense"] | None = None
    color: str | None = None


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    type: str
    color: str


class TransactionCreate(BaseModel):
    amount: int = Field(gt=0, description="Amount in cents")
    date: Date
    type: Literal["income", "expense"]
    category_id: int
    note: str | None = None


class TransactionUpdate(BaseModel):
    amount: int | None = Field(default=None, gt=0)
    date: Date | None = None
    type: Literal["income", "expense"] | None = None
    category_id: int | None = None
    note: str | None = None


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    amount: int
    date: Date
    type: str
    category_id: int
    note: str | None
    recurring_id: int | None
    created_at: datetime
    category: CategoryOut | None = None


class BudgetCreate(BaseModel):
    category_id: int
    limit_cents: int = Field(gt=0)
    month: str = Field(pattern=r"^\d{4}-\d{2}$")


class BudgetUpdate(BaseModel):
    limit_cents: int | None = Field(default=None, gt=0)
    month: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}$")


class BudgetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    category_id: int
    limit_cents: int
    month: str
    category: CategoryOut | None = None
    spent_cents: int = 0


class GoalCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    target_amount: int = Field(gt=0)
    current_amount: int = Field(default=0, ge=0)
    deadline: Date | None = None


class GoalUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    target_amount: int | None = Field(default=None, gt=0)
    deadline: Date | None = None
    status: Literal["active", "completed", "cancelled"] | None = None


class GoalContribute(BaseModel):
    amount: int = Field(gt=0, description="Contribution in cents")


class GoalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    target_amount: int
    current_amount: int
    deadline: Date | None
    status: str
    created_at: datetime
    progress_pct: float = 0.0


class RecurringCreate(BaseModel):
    amount: int = Field(gt=0)
    category_id: int
    type: Literal["income", "expense"]
    cadence: Literal["weekly", "monthly", "yearly"]
    next_run_date: Date
    note: str | None = None
    active: bool = True


class RecurringUpdate(BaseModel):
    amount: int | None = Field(default=None, gt=0)
    category_id: int | None = None
    type: Literal["income", "expense"] | None = None
    cadence: Literal["weekly", "monthly", "yearly"] | None = None
    next_run_date: Date | None = None
    note: str | None = None
    active: bool | None = None


class RecurringOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    amount: int
    category_id: int
    type: str
    cadence: str
    next_run_date: Date
    note: str | None
    active: bool
    created_at: datetime
    category: CategoryOut | None = None


class SettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    currency_code: str


class SettingsUpdate(BaseModel):
    currency_code: str = Field(min_length=3, max_length=3)


class MonthOverview(BaseModel):
    month: str
    income_cents: int
    expense_cents: int
    net_cents: int


class CategorySpend(BaseModel):
    category_id: int
    category_name: str
    color: str
    total_cents: int


class GoalProgress(BaseModel):
    id: int
    name: str
    target_amount: int
    current_amount: int
    progress_pct: float
    status: str
    deadline: Date | None
