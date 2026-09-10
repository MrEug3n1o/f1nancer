import { randomUUID } from "expo-crypto";
import {
  advanceRunDate, asBool, asInt, budgetSpentCents, byCurrency, currentMonth,
  enrichCreditDebt, enrichDeposit, goalProgressPct, goalSavedCents, monthOverview,
  openingTxnType, paymentTxnType, pocketOverview, spendByCategory, todayISO, trends,
  type Budget, type Cadence, type Category, type CategorySpend, type CategoryType,
  type CreditDebt, type Currency, type CurrencyMonthSplit, type Deposit, type Goal,
  type MoneyLocation, type MonthOverview, type PocketOverview, type RecurringRule,
  type Settings, type ThemeMode, type Transaction, type TrendPoint,
} from "@f1nancer/domain";
import { powerSync } from "../sync/database";
import { getSupabase } from "../sync/supabaseClient";

type Row = Record<string, unknown>;

export interface MobileData {
  categories: Category[]; transactions: Transaction[]; budgets: Budget[]; goals: Goal[];
  deposits: Deposit[]; creditDebts: CreditDebt[]; recurring: RecurringRule[];
  currencies: Currency[]; settings: Settings; pocket: PocketOverview; month: MonthOverview;
  spending: CategorySpend[]; trend: TrendPoint[]; currencySplit: CurrencyMonthSplit[];
}

export interface TransactionInput {
  amount: number; currency_code: string; date: string; type: CategoryType;
  category_id: string; money_location: MoneyLocation; note?: string | null;
  recurring_id?: string | null; goal_id?: string | null; credit_debt_id?: string | null;
}

const nowIso = () => new Date().toISOString();
const str = (value: unknown) => String(value ?? "");
const nullable = (value: unknown) => value == null || value === "" ? null : String(value);
const iso = (value: unknown) => String(value ?? "").slice(0, 10);
const code = (value: unknown) => String(value || "USD").trim().toUpperCase();
function parseJson<T>(value: unknown, fallback: T): T {
  try { return JSON.parse(String(value ?? "")) as T; } catch { return fallback; }
}
async function rows(sql: string, params: unknown[] = []) { return powerSync.getAll<Row>(sql, params); }
async function exec(sql: string, params: unknown[] = []) { await powerSync.execute(sql, params); }

function mapCategory(row: Row): Category {
  return { id: str(row.id), name: str(row.name), type: str(row.type) as CategoryType, color: str(row.color) || "#5B8C5A" };
}
function mapTransaction(row: Row, categories: Category[]): Transaction {
  const categoryId = str(row.category_id);
  return {
    id: str(row.id), amount: asInt(row.amount), currency_code: code(row.currency_code), date: iso(row.date),
    type: str(row.type) as CategoryType, category_id: categoryId,
    money_location: str(row.money_location) === "cash" ? "cash" : "card",
    note: nullable(row.note), recurring_id: nullable(row.recurring_id), goal_id: nullable(row.goal_id),
    credit_debt_id: nullable(row.credit_debt_id), created_at: str(row.created_at),
    updated_at: nullable(row.updated_at) ?? undefined,
    category: categories.find((item) => item.id === categoryId) ?? null,
  };
}
function mapDeposit(row: Row): Deposit {
  return enrichDeposit({
    id: str(row.id), name: str(row.name), type: str(row.type) as Deposit["type"],
    principal_cents: asInt(row.principal_cents), currency_code: code(row.currency_code),
    start_date: iso(row.start_date), end_date: iso(row.end_date),
    money_location: str(row.money_location) === "cash" ? "cash" : "card",
    annual_rate_bps: row.annual_rate_bps == null ? null : asInt(row.annual_rate_bps),
    counterparty: nullable(row.counterparty), note: nullable(row.note), status: str(row.status) as Deposit["status"],
    created_at: str(row.created_at), accrued_interest_cents: 0, current_value_cents: 0,
    maturity_value_cents: null, days_remaining: 0, term_progress_pct: 0,
  });
}
function mapCreditDebt(row: Row, transactions: Transaction[]): CreditDebt {
  return enrichCreditDebt({
    id: str(row.id), name: str(row.name), direction: str(row.direction) as CreditDebt["direction"],
    source: str(row.source) as CreditDebt["source"], principal_cents: asInt(row.principal_cents),
    currency_code: code(row.currency_code), start_date: iso(row.start_date), due_date: nullable(row.due_date),
    annual_rate_bps: row.annual_rate_bps == null ? null : asInt(row.annual_rate_bps),
    counterparty: nullable(row.counterparty), note: nullable(row.note), status: str(row.status) as CreditDebt["status"],
    created_at: str(row.created_at), accrued_interest_cents: 0, paid_cents: 0, remaining_cents: 0,
    progress_pct: 0, days_remaining: null,
  }, transactions);
}

async function loadCategories(userId: string) {
  return (await rows("SELECT * FROM categories WHERE user_id = ? ORDER BY name", [userId])).map(mapCategory);
}
async function loadTransactions(userId: string, categories: Category[]) {
  return (await rows("SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC, id DESC", [userId]))
    .map((row) => mapTransaction(row, categories));
}
async function categoryById(userId: string, id: string) {
  const category = (await loadCategories(userId)).find((item) => item.id === id);
  if (!category) throw new Error("Category not found");
  return category;
}
async function categoryByName(userId: string, name: string, type: CategoryType) {
  const existing = (await loadCategories(userId)).find((item) => item.name === name && item.type === type);
  return existing ?? createCategory(userId, name, type, type === "expense" ? "#A4161A" : "#2D6A4F");
}

export async function loadMobileData(userId: string, selectedMonth = currentMonth()): Promise<MobileData> {
  const categories = await loadCategories(userId);
  const transactions = await loadTransactions(userId, categories);
  const [depositRows, creditRows, goalRows, budgetRows, recurringRows, currencyRows, settingsRows] = await Promise.all([
    rows("SELECT * FROM deposits WHERE user_id = ? ORDER BY created_at DESC", [userId]),
    rows("SELECT * FROM credit_debts WHERE user_id = ? ORDER BY created_at DESC", [userId]),
    rows("SELECT * FROM goals WHERE user_id = ? ORDER BY created_at DESC", [userId]),
    rows("SELECT * FROM budgets WHERE user_id = ? ORDER BY created_at DESC", [userId]),
    rows("SELECT * FROM recurring_rules WHERE user_id = ? ORDER BY created_at DESC", [userId]),
    rows("SELECT * FROM currencies WHERE user_id = ? ORDER BY code", [userId]),
    rows("SELECT * FROM settings WHERE user_id = ? LIMIT 1", [userId]),
  ]);
  const deposits = depositRows.map(mapDeposit);
  const creditDebts = creditRows.map((row) => mapCreditDebt(row, transactions));
  const goals = goalRows.map((row): Goal => {
    const id = str(row.id); const saved = goalSavedCents(transactions, id); const target = asInt(row.target_amount);
    return { id, name: str(row.name), target_amount: target, current_amount: saved, currency_code: code(row.currency_code),
      deadline: nullable(row.deadline), status: str(row.status) as Goal["status"], created_at: str(row.created_at),
      progress_pct: goalProgressPct(saved, target), transactions: transactions.filter((item) => item.goal_id === id) };
  });
  const budgets = budgetRows.map((row): Budget => {
    const categoryId = str(row.category_id); const currencyCode = code(row.currency_code);
    return { id: str(row.id), category_id: categoryId, limit_cents: asInt(row.limit_cents), month: selectedMonth,
      currency_code: currencyCode, category: categories.find((item) => item.id === categoryId) ?? null,
      spent_cents: budgetSpentCents(transactions, categoryId, selectedMonth, currencyCode) };
  });
  const recurring = recurringRows.map((row): RecurringRule => {
    const categoryId = str(row.category_id);
    return { id: str(row.id), amount: asInt(row.amount), currency_code: code(row.currency_code), category_id: categoryId,
      type: str(row.type) as CategoryType, cadence: str(row.cadence) as Cadence, billing_day: asInt(row.billing_day, 1),
      next_run_date: iso(row.next_run_date), money_location: str(row.money_location) === "cash" ? "cash" : "card",
      note: nullable(row.note), active: asBool(row.active), created_at: str(row.created_at),
      category: categories.find((item) => item.id === categoryId) ?? null };
  });
  const currencies = currencyRows.map((row): Currency => ({ id: str(row.id), code: code(row.code), name: str(row.name), created_at: str(row.created_at) }));
  const setting = settingsRows[0];
  const settings: Settings = setting ? {
    id: str(setting.id), default_currency_code: code(setting.default_currency_code), theme: (str(setting.theme) || "system") as ThemeMode,
    locale: str(setting.locale) || "en-US", dashboard_widgets: parseJson(setting.dashboard_widgets, []),
    dashboard_widget_views: parseJson(setting.dashboard_widget_views, {}), dashboard_widget_layout: parseJson(setting.dashboard_widget_layout, []),
    stats_charts: parseJson(setting.stats_charts, []),
  } : { id: "", default_currency_code: "USD", theme: "system", locale: "en-US", dashboard_widgets: [], dashboard_widget_views: {}, dashboard_widget_layout: [], stats_charts: [] };
  return { categories, transactions, budgets, goals, deposits, creditDebts, recurring, currencies, settings,
    pocket: pocketOverview(transactions, deposits), month: monthOverview(transactions, deposits, selectedMonth),
    spending: spendByCategory(transactions, categories, selectedMonth), trend: trends(transactions, 6),
    currencySplit: byCurrency(transactions, selectedMonth) };
}

export async function createCategory(userId: string, name: string, type: CategoryType, color: string) {
  const cleanName = name.trim(); if (!cleanName) throw new Error("Enter a category name");
  const id = randomUUID(); const ts = nowIso();
  await exec("INSERT INTO categories (id, user_id, name, type, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [id, userId, cleanName, type, color, ts, ts]);
  return { id, name: cleanName, type, color } satisfies Category;
}
export async function deleteCategory(userId: string, id: string) {
  for (const table of ["transactions", "budgets", "recurring_rules"]) {
    if ((await rows(`SELECT id FROM ${table} WHERE category_id = ? AND user_id = ? LIMIT 1`, [id, userId])).length)
      throw new Error("This category is in use. Remove or reassign its records first.");
  }
  await exec("DELETE FROM categories WHERE id = ? AND user_id = ?", [id, userId]);
}

export async function createTransaction(userId: string, input: TransactionInput) {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new Error("Enter an amount above zero");
  const category = await categoryById(userId, input.category_id);
  if (category.type !== input.type) throw new Error("Choose a matching category");
  if (input.goal_id && input.credit_debt_id) throw new Error("A transaction cannot belong to both a goal and a debt");
  const id = randomUUID(); const ts = nowIso();
  await exec(`INSERT INTO transactions (id, user_id, amount, currency_code, date, type, category_id, note, recurring_id, goal_id, credit_debt_id, money_location, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, userId, input.amount, code(input.currency_code), iso(input.date), input.type,
    input.category_id, input.note?.trim() || null, input.recurring_id ?? null, input.goal_id ?? null, input.credit_debt_id ?? null,
    input.money_location, ts, ts]);
  await syncLinkedAmounts(userId, input.goal_id, input.credit_debt_id); return id;
}
export async function deleteTransaction(userId: string, id: string) {
  const existing = (await loadTransactions(userId, await loadCategories(userId))).find((item) => item.id === id);
  await exec("DELETE FROM transactions WHERE id = ? AND user_id = ?", [id, userId]);
  await syncLinkedAmounts(userId, existing?.goal_id, existing?.credit_debt_id);
}
async function syncLinkedAmounts(userId: string, goalId?: string | null, creditId?: string | null) {
  if (goalId) {
    const txns = await loadTransactions(userId, await loadCategories(userId));
    await exec("UPDATE goals SET current_amount = ?, updated_at = ? WHERE id = ? AND user_id = ?", [goalSavedCents(txns, goalId), nowIso(), goalId, userId]);
  }
  if (creditId) {
    const item = (await loadMobileData(userId)).creditDebts.find((entry) => entry.id === creditId);
    if (item && item.status !== "cancelled") await exec("UPDATE credit_debts SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?",
      [item.remaining_cents <= 0 ? "paid" : item.status === "paid" ? "active" : item.status, nowIso(), creditId, userId]);
  }
}

export async function createBudget(userId: string, categoryId: string, limitCents: number, currencyCode: string) {
  if (!categoryId || limitCents <= 0) throw new Error("Choose a category and enter a budget above zero");
  const ts = nowIso(); await exec("INSERT INTO budgets (id, user_id, category_id, limit_cents, currency_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [randomUUID(), userId, categoryId, limitCents, code(currencyCode), ts, ts]);
}
export async function createGoal(userId: string, name: string, target: number, currencyCode: string, deadline?: string, initial = 0) {
  if (!name.trim() || target <= 0) throw new Error("Enter a goal name and target");
  const id = randomUUID(); const ts = nowIso();
  await exec("INSERT INTO goals (id, user_id, name, target_amount, current_amount, currency_code, deadline, status, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?, 'active', ?, ?)",
    [id, userId, name.trim(), target, code(currencyCode), deadline ? iso(deadline) : null, ts, ts]);
  if (initial > 0) await contributeGoal(userId, id, initial, currencyCode, "Initial contribution");
}
export async function contributeGoal(userId: string, goalId: string, amount: number, currencyCode: string, note?: string) {
  const category = await categoryByName(userId, "Goals", "expense");
  await createTransaction(userId, { amount, currency_code: currencyCode, date: todayISO(), type: "expense", category_id: category.id, money_location: "card", note, goal_id: goalId });
}
export async function completeGoal(userId: string, id: string) {
  await exec("UPDATE goals SET status = 'completed', updated_at = ? WHERE id = ? AND user_id = ?", [nowIso(), id, userId]);
}

export async function createDeposit(userId: string, input: { name: string; type: Deposit["type"]; principal: number; currency: string; start: string; end: string; rateBps?: number | null; counterparty?: string; note?: string; location?: MoneyLocation }) {
  if (!input.name.trim() || input.principal <= 0) throw new Error("Enter a name and amount");
  const ts = nowIso(); await exec(`INSERT INTO deposits (id, user_id, name, type, principal_cents, currency_code, start_date, end_date, annual_rate_bps, counterparty, note, status, money_location, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`, [randomUUID(), userId, input.name.trim(), input.type, input.principal,
    code(input.currency), iso(input.start), iso(input.end), input.rateBps ?? null, input.counterparty?.trim() || null, input.note?.trim() || null,
    input.location ?? "card", ts, ts]);
}
export async function completeDeposit(userId: string, item: Deposit) {
  const category = await categoryByName(userId, "Deposit return", "income");
  await createTransaction(userId, { amount: item.current_value_cents, currency_code: item.currency_code, date: todayISO(), type: "income", category_id: category.id, money_location: item.money_location, note: `Return of ${item.name}` });
  await exec("UPDATE deposits SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?", [item.type === "bank" ? "matured" : "returned", nowIso(), item.id, userId]);
}

export async function createCreditDebt(userId: string, input: { name: string; direction: CreditDebt["direction"]; source: CreditDebt["source"]; principal: number; currency: string; start: string; due?: string; rateBps?: number | null; counterparty?: string; note?: string }) {
  if (!input.name.trim() || input.principal <= 0) throw new Error("Enter a name and amount");
  const id = randomUUID(); const ts = nowIso();
  await exec(`INSERT INTO credit_debts (id, user_id, name, direction, source, principal_cents, currency_code, start_date, due_date, annual_rate_bps, counterparty, note, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`, [id, userId, input.name.trim(), input.direction, input.source, input.principal,
    code(input.currency), iso(input.start), input.due ? iso(input.due) : null, input.rateBps ?? null, input.counterparty?.trim() || null,
    input.note?.trim() || null, ts, ts]);
  const type = openingTxnType(input.direction); const category = await categoryByName(userId, input.direction === "credit" ? "Lent" : "Borrowed", type);
  await createTransaction(userId, { amount: input.principal, currency_code: input.currency, date: input.start, type, category_id: category.id, money_location: "card", note: input.name, credit_debt_id: id });
}
export async function payCreditDebt(userId: string, item: CreditDebt, amount: number) {
  const type = paymentTxnType(item.direction); const category = await categoryByName(userId, item.direction === "credit" ? "Credit repayment" : "Debt payment", type);
  await createTransaction(userId, { amount, currency_code: item.currency_code, date: todayISO(), type, category_id: category.id, money_location: "card", note: `Payment for ${item.name}`, credit_debt_id: item.id });
}

export async function createRecurring(userId: string, input: { amount: number; currency: string; categoryId: string; type: CategoryType; cadence: Cadence; billingDay: number; nextRun: string; note?: string; location?: MoneyLocation }) {
  if (input.amount <= 0 || !input.categoryId) throw new Error("Enter an amount and category");
  const ts = nowIso(); await exec(`INSERT INTO recurring_rules (id, user_id, amount, currency_code, category_id, type, cadence, billing_day, next_run_date, note, active, money_location, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`, [randomUUID(), userId, input.amount, code(input.currency), input.categoryId,
    input.type, input.cadence, input.billingDay, iso(input.nextRun), input.note?.trim() || null, input.location ?? "card", ts, ts]);
}
export async function toggleRecurring(userId: string, id: string, active: boolean) {
  await exec("UPDATE recurring_rules SET active = ?, updated_at = ? WHERE id = ? AND user_id = ?", [active ? 1 : 0, nowIso(), id, userId]);
}
export async function processRecurring(userId: string) {
  try { const { data, error } = await getSupabase().rpc("process_due_recurring_rules"); if (!error) return Number(data ?? 0); } catch { /* offline */ }
  const data = await loadMobileData(userId); let created = 0; const today = todayISO();
  for (const rule of data.recurring.filter((item) => item.active && item.next_run_date <= today)) {
    let next = rule.next_run_date;
    while (next <= today) {
      await createTransaction(userId, { amount: rule.amount, currency_code: rule.currency_code, date: next, type: rule.type, category_id: rule.category_id, money_location: rule.money_location, note: rule.note, recurring_id: rule.id });
      next = advanceRunDate(next, rule.cadence, rule.billing_day); created += 1;
    }
    await exec("UPDATE recurring_rules SET next_run_date = ?, updated_at = ? WHERE id = ? AND user_id = ?", [next, nowIso(), rule.id, userId]);
  }
  return created;
}

export async function saveSettings(userId: string, current: Settings, patch: { theme?: ThemeMode; default_currency_code?: string }) {
  const next = { ...current, ...patch }; const ts = nowIso();
  if (!current.id) {
    await exec(`INSERT INTO settings (id, user_id, default_currency_code, theme, locale, dashboard_widgets, stats_charts, dashboard_widget_views, dashboard_widget_layout, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [randomUUID(), userId, code(next.default_currency_code), next.theme, next.locale,
      JSON.stringify(next.dashboard_widgets), JSON.stringify(next.stats_charts ?? []), JSON.stringify(next.dashboard_widget_views), JSON.stringify(next.dashboard_widget_layout), ts, ts]);
  } else await exec("UPDATE settings SET default_currency_code = ?, theme = ?, updated_at = ? WHERE id = ? AND user_id = ?",
    [code(next.default_currency_code), next.theme, ts, current.id, userId]);
}
export async function addCurrency(userId: string, currencyCode: string, name?: string) {
  const currency = code(currencyCode); if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Currency code must be 3 letters");
  if ((await rows("SELECT id FROM currencies WHERE user_id = ? AND code = ?", [userId, currency])).length) return;
  const ts = nowIso(); await exec("INSERT INTO currencies (id, user_id, code, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    [randomUUID(), userId, currency, name?.trim() || currency, ts, ts]);
}
export async function deleteRecord(userId: string, table: "budgets" | "goals" | "deposits" | "credit_debts" | "recurring_rules" | "currencies", id: string) {
  if (table === "currencies") await exec("DELETE FROM currencies WHERE user_id = ? AND code = ?", [userId, id]);
  else await exec(`DELETE FROM ${table} WHERE id = ? AND user_id = ?`, [id, userId]);
}

export { currentMonth, todayISO };
export function dollarsToCents(value: string) {
  const amount = Number(value.replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid amount");
  return Math.round(amount * 100);
}
export function formatMoney(cents: number, currencyCode = "USD") {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currencyCode }).format(cents / 100);
}
