export type CategoryType = "income" | "expense";
export type Cadence = "weekly" | "monthly" | "yearly";
export type GoalStatus = "active" | "completed" | "cancelled";
export type DepositType = "bank" | "rental";
export type DepositStatus = "active" | "matured" | "returned" | "cancelled";
export type CreditDebtDirection = "credit" | "debt";
export type CreditDebtSource = "bank" | "informal";
export type CreditDebtStatus = "active" | "paid" | "cancelled";
export type MoneyLocation = "cash" | "card";
export type ThemeMode = "light" | "dark" | "system";

export interface Profile {
  id: string;
  username: string;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  color: string;
}

export interface Currency {
  id: string;
  code: string;
  name: string;
  created_at: string;
}

export interface Transaction {
  id: string;
  amount: number;
  currency_code: string;
  date: string;
  type: CategoryType;
  category_id: string;
  money_location: MoneyLocation;
  note: string | null;
  recurring_id: string | null;
  goal_id?: string | null;
  credit_debt_id?: string | null;
  created_at: string;
  updated_at?: string;
  category?: Category | null;
}

export interface Budget {
  id: string;
  category_id: string;
  limit_cents: number;
  month: string;
  currency_code: string;
  category?: Category | null;
  spent_cents: number;
}

export interface Goal {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  currency_code: string;
  deadline: string | null;
  status: GoalStatus;
  created_at: string;
  progress_pct: number;
  transactions?: Transaction[];
}

export interface Deposit {
  id: string;
  name: string;
  type: DepositType;
  principal_cents: number;
  currency_code: string;
  start_date: string;
  end_date: string;
  money_location: MoneyLocation;
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

export interface CreditDebt {
  id: string;
  name: string;
  direction: CreditDebtDirection;
  source: CreditDebtSource;
  principal_cents: number;
  currency_code: string;
  start_date: string;
  due_date: string | null;
  annual_rate_bps: number | null;
  counterparty: string | null;
  note: string | null;
  status: CreditDebtStatus;
  created_at: string;
  accrued_interest_cents: number;
  paid_cents: number;
  remaining_cents: number;
  progress_pct: number;
  days_remaining: number | null;
  transactions?: Transaction[];
}

export interface CreditDebtSummaryItem {
  currency_code: string;
  credit_count: number;
  debt_count: number;
  credit_remaining_cents: number;
  debt_remaining_cents: number;
}

export interface RecurringRule {
  id: string;
  amount: number;
  currency_code: string;
  category_id: string;
  type: CategoryType;
  cadence: Cadence;
  billing_day: number;
  next_run_date: string;
  money_location: MoneyLocation;
  note: string | null;
  active: boolean;
  created_at: string;
  category?: Category | null;
}

export interface Settings {
  id: string;
  default_currency_code: string;
  theme: ThemeMode;
  locale: string;
  dashboard_widgets: string[];
  dashboard_widget_views: Record<string, string>;
  dashboard_widget_layout: unknown[];
  stats_charts?: string[];
}

export interface CurrencyOverview {
  currency_code: string;
  income_cents: number;
  expense_cents: number;
  net_cents: number;
  cash_net_cents?: number;
  card_net_cents?: number;
}

export interface MonthOverview {
  month: string;
  currencies: CurrencyOverview[];
}

export interface PocketOverview {
  currencies: CurrencyOverview[];
}

export interface MoneyLocationSplit {
  income_cents: number;
  expense_cents: number;
}

export interface MoneyLocationCurrencyOverview {
  currency_code: string;
  cash: MoneyLocationSplit;
  card: MoneyLocationSplit;
}

export interface MoneyLocationOverview {
  month: string;
  currencies: MoneyLocationCurrencyOverview[];
}

export interface CategorySpend {
  category_id: string;
  category_name: string;
  color: string;
  currency_code: string;
  total_cents: number;
}

export interface GoalProgress {
  id: string;
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

export interface LocalExportPayload {
  currencies: Array<{ code: string; name: string; created_at?: string }>;
  categories: Array<{
    id: number;
    name: string;
    type: CategoryType;
    color: string;
  }>;
  transactions: Array<Record<string, unknown>>;
  budgets: Array<Record<string, unknown>>;
  goals: Array<Record<string, unknown>>;
  deposits: Array<Record<string, unknown>>;
  credit_debts: Array<Record<string, unknown>>;
  recurring_rules: Array<Record<string, unknown>>;
  settings: Record<string, unknown> | null;
}
