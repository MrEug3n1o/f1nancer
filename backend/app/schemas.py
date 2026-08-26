from datetime import date as Date
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


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


class CurrencyCreate(BaseModel):
    code: str = Field(min_length=3, max_length=3)

    @field_validator("code")
    @classmethod
    def upper_code(cls, v: str) -> str:
        return v.strip().upper()


class CurrencyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str
    name: str
    created_at: datetime


class CurrencyCatalogItem(BaseModel):
    code: str
    name: str


class TransactionCreate(BaseModel):
    amount: int = Field(gt=0, description="Amount in cents")
    currency_code: str = Field(min_length=3, max_length=3)
    date: Date
    type: Literal["income", "expense"]
    category_id: int
    note: str | None = None

    @field_validator("currency_code")
    @classmethod
    def upper_currency(cls, v: str) -> str:
        return v.strip().upper()


class TransactionUpdate(BaseModel):
    amount: int | None = Field(default=None, gt=0)
    currency_code: str | None = Field(default=None, min_length=3, max_length=3)
    date: Date | None = None
    type: Literal["income", "expense"] | None = None
    category_id: int | None = None
    note: str | None = None

    @field_validator("currency_code")
    @classmethod
    def upper_currency(cls, v: str | None) -> str | None:
        return v.strip().upper() if v else v


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    amount: int
    currency_code: str
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
    currency_code: str = Field(min_length=3, max_length=3)

    @field_validator("currency_code")
    @classmethod
    def upper_currency(cls, v: str) -> str:
        return v.strip().upper()


class BudgetUpdate(BaseModel):
    limit_cents: int | None = Field(default=None, gt=0)
    month: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}$")
    currency_code: str | None = Field(default=None, min_length=3, max_length=3)

    @field_validator("currency_code")
    @classmethod
    def upper_currency(cls, v: str | None) -> str | None:
        return v.strip().upper() if v else v


class BudgetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    category_id: int
    limit_cents: int
    month: str
    currency_code: str
    category: CategoryOut | None = None
    spent_cents: int = 0


class GoalCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    target_amount: int = Field(gt=0)
    current_amount: int = Field(default=0, ge=0)
    currency_code: str = Field(min_length=3, max_length=3)
    deadline: Date | None = None

    @field_validator("currency_code")
    @classmethod
    def upper_currency(cls, v: str) -> str:
        return v.strip().upper()


class GoalUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    target_amount: int | None = Field(default=None, gt=0)
    deadline: Date | None = None
    status: Literal["active", "completed", "cancelled"] | None = None
    currency_code: str | None = Field(default=None, min_length=3, max_length=3)

    @field_validator("currency_code")
    @classmethod
    def upper_currency(cls, v: str | None) -> str | None:
        return v.strip().upper() if v else v


class GoalContribute(BaseModel):
    amount: int = Field(gt=0, description="Contribution in cents")


class GoalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    target_amount: int
    current_amount: int
    currency_code: str
    deadline: Date | None
    status: str
    created_at: datetime
    progress_pct: float = 0.0


class DepositCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    type: Literal["bank", "rental"]
    principal_cents: int = Field(gt=0)
    currency_code: str = Field(min_length=3, max_length=3)
    start_date: Date
    end_date: Date
    annual_rate_bps: int | None = Field(default=None, ge=0)
    counterparty: str | None = Field(default=None, max_length=200)
    note: str | None = None

    @field_validator("currency_code")
    @classmethod
    def upper_currency(cls, v: str) -> str:
        return v.strip().upper()


class DepositUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    principal_cents: int | None = Field(default=None, gt=0)
    currency_code: str | None = Field(default=None, min_length=3, max_length=3)
    start_date: Date | None = None
    end_date: Date | None = None
    annual_rate_bps: int | None = Field(default=None, ge=0)
    counterparty: str | None = Field(default=None, max_length=200)
    note: str | None = None
    status: Literal["active", "matured", "returned", "cancelled"] | None = None

    @field_validator("currency_code")
    @classmethod
    def upper_currency(cls, v: str | None) -> str | None:
        return v.strip().upper() if v else v


class DepositOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    type: str
    principal_cents: int
    currency_code: str
    start_date: Date
    end_date: Date
    annual_rate_bps: int | None
    counterparty: str | None
    note: str | None
    status: str
    created_at: datetime
    accrued_interest_cents: int = 0
    current_value_cents: int = 0
    maturity_value_cents: int | None = None
    days_remaining: int = 0
    term_progress_pct: float = 0.0


class DepositSummaryItem(BaseModel):
    currency_code: str
    active_count: int
    principal_cents: int
    current_value_cents: int


class RecurringCreate(BaseModel):
    amount: int = Field(gt=0)
    currency_code: str = Field(min_length=3, max_length=3)
    category_id: int
    type: Literal["income", "expense"]
    cadence: Literal["weekly", "monthly", "yearly"]
    next_run_date: Date
    note: str | None = None
    active: bool = True

    @field_validator("currency_code")
    @classmethod
    def upper_currency(cls, v: str) -> str:
        return v.strip().upper()


class RecurringUpdate(BaseModel):
    amount: int | None = Field(default=None, gt=0)
    currency_code: str | None = Field(default=None, min_length=3, max_length=3)
    category_id: int | None = None
    type: Literal["income", "expense"] | None = None
    cadence: Literal["weekly", "monthly", "yearly"] | None = None
    next_run_date: Date | None = None
    note: str | None = None
    active: bool | None = None

    @field_validator("currency_code")
    @classmethod
    def upper_currency(cls, v: str | None) -> str | None:
        return v.strip().upper() if v else v


class RecurringOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    amount: int
    currency_code: str
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
    default_currency_code: str
    theme: str
    locale: str
    first_day_of_week: str
    dashboard_widgets: list[str]
    stats_charts: list[str]


class SettingsUpdate(BaseModel):
    default_currency_code: str | None = Field(default=None, min_length=3, max_length=3)
    theme: Literal["light", "dark", "system"] | None = None
    locale: str | None = Field(default=None, max_length=20)
    first_day_of_week: Literal["monday", "sunday"] | None = None
    dashboard_widgets: list[str] | None = None
    stats_charts: list[str] | None = None

    @field_validator("default_currency_code")
    @classmethod
    def upper_currency(cls, v: str | None) -> str | None:
        return v.strip().upper() if v else v


class CurrencyOverview(BaseModel):
    currency_code: str
    income_cents: int
    expense_cents: int
    net_cents: int


class MonthOverview(BaseModel):
    month: str
    currencies: list[CurrencyOverview]


class CategorySpend(BaseModel):
    category_id: int
    category_name: str
    color: str
    currency_code: str
    total_cents: int


class GoalProgress(BaseModel):
    id: int
    name: str
    target_amount: int
    current_amount: int
    currency_code: str
    progress_pct: float
    status: str
    deadline: Date | None


class TrendPoint(BaseModel):
    month: str
    currency_code: str
    income_cents: int
    expense_cents: int


class CurrencyMonthSplit(BaseModel):
    currency_code: str
    income_cents: int
    expense_cents: int
