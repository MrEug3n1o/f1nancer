export type CategoryType = "income" | "expense";
export type Cadence = "weekly" | "monthly" | "yearly";
export type GoalStatus = "active" | "completed" | "cancelled";

export interface Category {
  id: number;
  name: string;
  type: CategoryType;
  color: string;
}

export interface Transaction {
  id: number;
  amount: number;
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
  category?: Category | null;
  spent_cents: number;
}

export interface Goal {
  id: number;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
  status: GoalStatus;
  created_at: string;
  progress_pct: number;
}

export interface RecurringRule {
  id: number;
  amount: number;
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
  currency_code: string;
}

export interface MonthOverview {
  month: string;
  income_cents: number;
  expense_cents: number;
  net_cents: number;
}

export interface CategorySpend {
  category_id: number;
  category_name: string;
  color: string;
  total_cents: number;
}

export interface GoalProgress {
  id: number;
  name: string;
  target_amount: number;
  current_amount: number;
  progress_pct: number;
  status: string;
  deadline: string | null;
}
