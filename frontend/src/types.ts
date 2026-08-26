export type CategoryType = "income" | "expense";
export type Cadence = "weekly" | "monthly" | "yearly";
export type GoalStatus = "active" | "completed" | "cancelled";
export type DepositType = "bank" | "rental";
export type DepositStatus = "active" | "matured" | "returned" | "cancelled";
export type ThemeMode = "light" | "dark" | "system";

export interface Category {
  id: number;
  name: string;
  type: CategoryType;
  color: string;
}

export interface Currency {
  code: string;
  name: string;
  created_at: string;
}

export interface CurrencyCatalogItem {
  code: string;
  name: string;
}

export interface Transaction {
  id: number;
  amount: number;
  currency_code: string;
  date: string;
  type: CategoryType;
  category_id: number;
  note: string | null;
  recurring_id: number | null;
  created_at: string;
  category?: Category | null;
}

export interface Budget {
  id: number;
  category_id: number;
  limit_cents: number;
  month: string;
  currency_code: string;
  category?: Category | null;
  spent_cents: number;
}

export interface Goal {
  id: number;
  name: string;
  target_amount: number;
  current_amount: number;
  currency_code: string;
  deadline: string | null;
  status: GoalStatus;
  created_at: string;
  progress_pct: number;
}

export interface Deposit {
  id: number;
  name: string;
  type: DepositType;
  principal_cents: number;
  currency_code: string;
  start_date: string;
  end_date: string;
  annual_rate_bps: number | null;
  counterparty: string | null;
  note: string | null;
  status: DepositStatus;
  created_at: string;
  accrued_interest_cents: number;
  current_value_cents: number;
  maturity_value_cents: number | null;
  days_remaining: number;
  term_progress_pct: number;
}

export interface DepositSummaryItem {
  currency_code: string;
  active_count: number;
  principal_cents: number;
  current_value_cents: number;
}

export interface RecurringRule {
  id: number;
  amount: number;
  currency_code: string;
  category_id: number;
  type: CategoryType;
  cadence: Cadence;
  next_run_date: string;
  note: string | null;
  active: boolean;
  created_at: string;
  category?: Category | null;
}

export interface Settings {
  id: number;
  default_currency_code: string;
  theme: ThemeMode;
  locale: string;
  first_day_of_week: "monday" | "sunday";
  dashboard_widgets: string[];
}

export interface CurrencyOverview {
  currency_code: string;
  income_cents: number;
  expense_cents: number;
  net_cents: number;
}

export interface MonthOverview {
  month: string;
  currencies: CurrencyOverview[];
}

export interface CategorySpend {
  category_id: number;
  category_name: string;
  color: string;
  currency_code: string;
  total_cents: number;
}

export interface GoalProgress {
  id: number;
  name: string;
  target_amount: number;
  current_amount: number;
  currency_code: string;
  progress_pct: number;
  status: string;
  deadline: string | null;
}

export interface TrendPoint {
  month: string;
  currency_code: string;
  income_cents: number;
  expense_cents: number;
}

export interface CurrencyMonthSplit {
  currency_code: string;
  income_cents: number;
  expense_cents: number;
}

export const DASHBOARD_WIDGET_OPTIONS = [
  { id: "overview", label: "Month overview" },
  { id: "spend_by_category", label: "Spend by category" },
  { id: "budgets", label: "Budget progress" },
  { id: "category_table", label: "Category breakdown table" },
  { id: "goals", label: "Goals" },
  { id: "deposits", label: "Deposits" },
] as const;
