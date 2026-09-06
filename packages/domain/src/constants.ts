export const AUTH_EMAIL_DOMAIN = "users.f1nancer.local";

export const RESERVED_USERNAMES = new Set([
  "admin",
  "administrator",
  "api",
  "auth",
  "f1nancer",
  "help",
  "null",
  "root",
  "support",
  "system",
  "undefined",
  "user",
]);

export const USERNAME_PATTERN = /^[a-z0-9_]{3,32}$/;

export const DEFAULT_CATEGORIES: readonly [string, "income" | "expense", string][] = [
  ["Salary", "income", "#2D6A4F"],
  ["Freelance", "income", "#40916C"],
  ["Other Income", "income", "#52B788"],
  ["Deposit return", "income", "#2D6A4F"],
  ["Borrowed", "income", "#40916C"],
  ["Credit repayment", "income", "#2D6A4F"],
  ["Groceries", "expense", "#BC4749"],
  ["Rent", "expense", "#A4161A"],
  ["Utilities", "expense", "#E09F3E"],
  ["Transport", "expense", "#335C81"],
  ["Dining", "expense", "#C1666B"],
  ["Entertainment", "expense", "#7B2D8E"],
  ["Health", "expense", "#1B998B"],
  ["Shopping", "expense", "#D4A373"],
  ["Goals", "expense", "#5B8C5A"],
  ["Lent", "expense", "#335C81"],
  ["Debt payment", "expense", "#A4161A"],
  ["Other Expense", "expense", "#495057"],
];

export const GOALS_CATEGORY_NAME = "Goals";
export const DEPOSIT_RETURN_CATEGORY = "Deposit return";
export const BORROWED_CATEGORY = "Borrowed";
export const LENT_CATEGORY = "Lent";
export const DEBT_PAYMENT_CATEGORY = "Debt payment";
export const CREDIT_REPAYMENT_CATEGORY = "Credit repayment";

export const DEFAULT_DASHBOARD_WIDGETS = [
  "pocket",
  "overview",
  "money_location",
  "spend_by_category",
  "budgets",
  "goals",
  "deposits",
  "credits_debts",
];

export const DEFAULT_STATS_CHARTS = ["trends", "spend_by_category", "by_currency"];

export const SYNCED_TABLES = [
  "profiles",
  "currencies",
  "categories",
  "transactions",
  "budgets",
  "goals",
  "deposits",
  "credit_debts",
  "recurring_rules",
  "settings",
] as const;

export type SyncedTable = (typeof SYNCED_TABLES)[number];
