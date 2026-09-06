import {
  asBool,
  asInt,
  byCurrency,
  creditsDebtsSummary,
  DEFAULT_DASHBOARD_WIDGETS,
  depositsSummary,
  enrichBudget,
  enrichCreditDebt,
  enrichDeposit,
  goalProgressPct,
  goalSavedCents,
  goalsProgress,
  monthOverview,
  moneyLocationOverview,
  openingTxnType,
  paymentTxnType,
  pocketOverview,
  spendByCategory,
  todayISO,
  trends,
  type Budget,
  type Category,
  type CategoryType,
  type CreditDebt,
  type Currency,
  type Deposit,
  type Goal,
  type RecurringRule,
  type Settings,
  type Transaction,
} from "@f1nancer/domain";
import type { AbstractPowerSyncDatabase } from "@powersync/web";
import { ISO_CURRENCY_CATALOG } from "../currencyCatalog";
import { DEFAULT_WIDGET_LAYOUT } from "../types";
import { supabase } from "../sync/connector";

type Row = Record<string, unknown>;

let db: AbstractPowerSyncDatabase | null = null;
let userId: string | null = null;

export function bindDataLayer(
  database: AbstractPowerSyncDatabase | null,
  uid: string | null,
) {
  db = database;
  userId = uid;
}

function requireDb() {
  if (!db || !userId) {
    throw new Error("Sign in to sync your data");
  }
  return { db, userId };
}

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return crypto.randomUUID();
}

function str(value: unknown): string {
  return String(value ?? "");
}

function strOrNull(value: unknown): string | null {
  if (value == null || value === "") return null;
  return String(value);
}

function isoDate(value: unknown): string {
  return String(value ?? "").slice(0, 10);
}

function mapCategory(row: Row): Category {
  return {
    id: str(row.id),
    name: str(row.name),
    type: str(row.type) as CategoryType,
    color: str(row.color) || "#5B8C5A",
  };
}

function mapCurrency(row: Row): Currency {
  return {
    id: str(row.id),
    code: str(row.code),
    name: str(row.name),
    created_at: str(row.created_at),
  };
}

function mapTransaction(row: Row, category?: Category | null): Transaction {
  return {
    id: str(row.id),
    amount: asInt(row.amount),
    currency_code: str(row.currency_code),
    date: isoDate(row.date),
    type: str(row.type) as CategoryType,
    category_id: str(row.category_id),
    money_location: str(row.money_location) === "cash" ? "cash" : "card",
    note: strOrNull(row.note),
    recurring_id: strOrNull(row.recurring_id),
    goal_id: strOrNull(row.goal_id),
    credit_debt_id: strOrNull(row.credit_debt_id),
    created_at: str(row.created_at),
    updated_at: strOrNull(row.updated_at) ?? undefined,
    category: category ?? null,
  };
}

function mapGoal(row: Row): Goal {
  return {
    id: str(row.id),
    name: str(row.name),
    target_amount: asInt(row.target_amount),
    current_amount: asInt(row.current_amount),
    currency_code: str(row.currency_code),
    deadline: strOrNull(row.deadline),
    status: str(row.status) as Goal["status"],
    created_at: str(row.created_at),
    progress_pct: 0,
  };
}

function mapDeposit(row: Row): Deposit {
  return enrichDeposit({
    id: str(row.id),
    name: str(row.name),
    type: str(row.type) as Deposit["type"],
    principal_cents: asInt(row.principal_cents),
    currency_code: str(row.currency_code),
    start_date: isoDate(row.start_date),
    end_date: isoDate(row.end_date),
    money_location: str(row.money_location) === "cash" ? "cash" : "card",
    annual_rate_bps: row.annual_rate_bps == null ? null : asInt(row.annual_rate_bps),
    counterparty: strOrNull(row.counterparty),
    note: strOrNull(row.note),
    status: str(row.status) as Deposit["status"],
    created_at: str(row.created_at),
    accrued_interest_cents: 0,
    current_value_cents: 0,
    maturity_value_cents: null,
    days_remaining: 0,
    term_progress_pct: 0,
  });
}

function mapCreditDebt(row: Row): CreditDebt {
  return {
    id: str(row.id),
    name: str(row.name),
    direction: str(row.direction) as CreditDebt["direction"],
    source: str(row.source) as CreditDebt["source"],
    principal_cents: asInt(row.principal_cents),
    currency_code: str(row.currency_code),
    start_date: isoDate(row.start_date),
    due_date: strOrNull(row.due_date),
    annual_rate_bps: row.annual_rate_bps == null ? null : asInt(row.annual_rate_bps),
    counterparty: strOrNull(row.counterparty),
    note: strOrNull(row.note),
    status: str(row.status) as CreditDebt["status"],
    created_at: str(row.created_at),
    accrued_interest_cents: 0,
    paid_cents: 0,
    remaining_cents: 0,
    progress_pct: 0,
    days_remaining: null,
  };
}

function mapRule(row: Row, category?: Category | null): RecurringRule {
  return {
    id: str(row.id),
    amount: asInt(row.amount),
    currency_code: str(row.currency_code),
    category_id: str(row.category_id),
    type: str(row.type) as CategoryType,
    cadence: str(row.cadence) as RecurringRule["cadence"],
    billing_day: asInt(row.billing_day, 1),
    next_run_date: isoDate(row.next_run_date),
    money_location: str(row.money_location) === "cash" ? "cash" : "card",
    note: strOrNull(row.note),
    active: asBool(row.active),
    created_at: str(row.created_at),
    category: category ?? null,
  };
}

function parseJson<T>(raw: unknown, fallback: T): T {
  try {
    return JSON.parse(String(raw ?? "")) as T;
  } catch {
    return fallback;
  }
}

function mapSettings(row: Row): Settings {
  return {
    id: str(row.id),
    default_currency_code: str(row.default_currency_code) || "USD",
    theme: (str(row.theme) as Settings["theme"]) || "system",
    locale: str(row.locale) || "en-US",
    dashboard_widgets: parseJson(row.dashboard_widgets, [...DEFAULT_DASHBOARD_WIDGETS]),
    dashboard_widget_views: parseJson(row.dashboard_widget_views, {}),
    dashboard_widget_layout: parseJson(row.dashboard_widget_layout, DEFAULT_WIDGET_LAYOUT),
    stats_charts: parseJson(row.stats_charts, ["trends", "spend_by_category", "by_currency"]),
  };
}

async function all(sql: string, params: unknown[] = []): Promise<Row[]> {
  const { db: database } = requireDb();
  return database.getAll<Row>(sql, params);
}

async function one(sql: string, params: unknown[] = []): Promise<Row | null> {
  const rows = await all(sql, params);
  return rows[0] ?? null;
}

async function exec(sql: string, params: unknown[] = []) {
  const { db: database } = requireDb();
  await database.execute(sql, params);
}

async function categoriesAll(type?: string): Promise<Category[]> {
  const { userId: uid } = requireDb();
  const rows = type
    ? await all(
        "SELECT * FROM categories WHERE user_id = ? AND type = ? ORDER BY name",
        [uid, type],
      )
    : await all("SELECT * FROM categories WHERE user_id = ? ORDER BY name", [uid]);
  return rows.map(mapCategory);
}

async function categoryById(id: string): Promise<Category> {
  const { userId: uid } = requireDb();
  const row = await one("SELECT * FROM categories WHERE id = ? AND user_id = ?", [
    id,
    uid,
  ]);
  if (!row) throw new Error("Category not found");
  return mapCategory(row);
}

async function categoryByName(name: string, type: CategoryType): Promise<Category> {
  const { userId: uid } = requireDb();
  const row = await one(
    "SELECT * FROM categories WHERE user_id = ? AND name = ? AND type = ?",
    [uid, name, type],
  );
  if (row) return mapCategory(row);
  const id = newId();
  const ts = nowIso();
  const color =
    name === "Goals"
      ? "#5B8C5A"
      : name === "Lent" || name === "Transport"
        ? "#335C81"
        : name === "Debt payment" || name === "Rent"
          ? "#A4161A"
          : "#2D6A4F";
  await exec(
    `INSERT INTO categories (id, user_id, name, type, color, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, uid, name, type, color, ts, ts],
  );
  return { id, name, type, color };
}

async function transactionsAll(): Promise<Transaction[]> {
  const { userId: uid } = requireDb();
  const [txRows, cats] = await Promise.all([
    all("SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC, id DESC", [uid]),
    categoriesAll(),
  ]);
  const catMap = new Map(cats.map((c) => [c.id, c]));
  return txRows.map((row) => mapTransaction(row, catMap.get(str(row.category_id))));
}

async function depositsAll(): Promise<Deposit[]> {
  const { userId: uid } = requireDb();
  const rows = await all(
    "SELECT * FROM deposits WHERE user_id = ? ORDER BY created_at DESC",
    [uid],
  );
  return rows.map(mapDeposit);
}

async function creditsAll(): Promise<CreditDebt[]> {
  const { userId: uid } = requireDb();
  const [rows, txns] = await Promise.all([
    all("SELECT * FROM credit_debts WHERE user_id = ? ORDER BY created_at DESC", [uid]),
    transactionsAll(),
  ]);
  return rows.map((row) => enrichCreditDebt(mapCreditDebt(row), txns));
}

async function goalsAll(): Promise<Goal[]> {
  const { userId: uid } = requireDb();
  const [rows, txns] = await Promise.all([
    all("SELECT * FROM goals WHERE user_id = ? ORDER BY created_at DESC", [uid]),
    transactionsAll(),
  ]);
  return rows.map((row) => {
    const goal = mapGoal(row);
    const saved = goalSavedCents(txns, goal.id);
    const tagged = txns.filter((t) => t.goal_id === goal.id);
    return {
      ...goal,
      current_amount: saved,
      progress_pct: goalProgressPct(saved, goal.target_amount),
      transactions: tagged,
    };
  });
}

async function syncGoalAmount(goalId: string | null | undefined) {
  if (!goalId) return;
  const txns = await transactionsAll();
  const saved = goalSavedCents(txns, goalId);
  await exec("UPDATE goals SET current_amount = ?, updated_at = ? WHERE id = ?", [
    saved,
    nowIso(),
    goalId,
  ]);
}

async function syncCreditStatus(id: string | null | undefined) {
  if (!id) return;
  const items = await creditsAll();
  const item = items.find((c) => c.id === id);
  if (!item || item.status === "cancelled") return;
  const next =
    item.remaining_cents <= 0
      ? "paid"
      : item.status === "paid" && item.paid_cents < item.principal_cents
        ? "active"
        : item.status;
  if (next !== item.status) {
    await exec("UPDATE credit_debts SET status = ?, updated_at = ? WHERE id = ?", [
      next,
      nowIso(),
      id,
    ]);
  }
}

async function insertTransaction(payload: {
  amount: number;
  currency_code: string;
  date: string;
  type: CategoryType;
  category_id: string;
  money_location?: string;
  note?: string | null;
  goal_id?: string | null;
  credit_debt_id?: string | null;
  recurring_id?: string | null;
}) {
  const { userId: uid } = requireDb();
  const cat = await categoryById(payload.category_id);
  if (cat.type !== payload.type) {
    throw new Error("Category type does not match transaction type");
  }
  if (payload.goal_id && payload.credit_debt_id) {
    throw new Error("A transaction cannot be tagged to both a goal and a credit or debt");
  }
  const id = newId();
  const ts = nowIso();
  await exec(
    `INSERT INTO transactions (
      id, user_id, amount, currency_code, date, type, category_id, note,
      recurring_id, goal_id, credit_debt_id, money_location, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      uid,
      payload.amount,
      String(payload.currency_code).toUpperCase(),
      isoDate(payload.date),
      payload.type,
      payload.category_id,
      payload.note ?? null,
      payload.recurring_id ?? null,
      payload.goal_id ?? null,
      payload.credit_debt_id ?? null,
      payload.money_location === "cash" ? "cash" : "card",
      ts,
      ts,
    ],
  );
  await syncGoalAmount(payload.goal_id);
  await syncCreditStatus(payload.credit_debt_id);
  return id;
}

export async function handleGet(path: string): Promise<unknown> {
  const url = new URL(path, "https://local");
  const p = url.pathname;
  const q = url.searchParams;
  const { userId: uid } = requireDb();

  if (p === "/categories") {
    return categoriesAll(q.get("type") ?? undefined);
  }
  if (p === "/currencies") {
    const rows = await all(
      "SELECT * FROM currencies WHERE user_id = ? ORDER BY code",
      [uid],
    );
    return rows.map(mapCurrency);
  }
  if (p === "/transactions") {
    let txns = await transactionsAll();
    const month = q.get("month");
    const categoryId = q.get("category_id");
    const type = q.get("type");
    const currency = q.get("currency");
    const goalId = q.get("goal_id");
    const creditId = q.get("credit_debt_id");
    if (month) txns = txns.filter((t) => t.date.startsWith(month));
    if (categoryId) txns = txns.filter((t) => t.category_id === categoryId);
    if (type) txns = txns.filter((t) => t.type === type);
    if (currency) txns = txns.filter((t) => t.currency_code === currency.toUpperCase());
    if (goalId) txns = txns.filter((t) => t.goal_id === goalId);
    if (creditId) txns = txns.filter((t) => t.credit_debt_id === creditId);
    return txns;
  }
  if (p === "/budgets") {
    const month = q.get("month") || todayISO().slice(0, 7);
    const [rows, cats, txns] = await Promise.all([
      all("SELECT * FROM budgets WHERE user_id = ?", [uid]),
      categoriesAll(),
      transactionsAll(),
    ]);
    const catMap = new Map(cats.map((c) => [c.id, c]));
    return rows.map((row) =>
      enrichBudget(
        {
          id: str(row.id),
          category_id: str(row.category_id),
          limit_cents: asInt(row.limit_cents),
          currency_code: str(row.currency_code),
          category: catMap.get(str(row.category_id)) ?? null,
        },
        txns,
        month,
      ),
    );
  }
  if (p === "/goals") return goalsAll();
  if (p.startsWith("/goals/")) {
    const id = p.split("/")[2];
    const goal = (await goalsAll()).find((g) => g.id === id);
    if (!goal) throw new Error("Goal not found");
    return goal;
  }
  if (p === "/deposits") {
    const type = q.get("type");
    const rows = await depositsAll();
    return type ? rows.filter((d) => d.type === type) : rows;
  }
  if (p === "/credits-debts") {
    const source = q.get("source");
    const rows = await creditsAll();
    return source ? rows.filter((c) => c.source === source) : rows;
  }
  if (p === "/recurring") {
    const [rows, cats] = await Promise.all([
      all("SELECT * FROM recurring_rules WHERE user_id = ? ORDER BY created_at DESC", [uid]),
      categoriesAll(),
    ]);
    const catMap = new Map(cats.map((c) => [c.id, c]));
    return rows.map((row) => mapRule(row, catMap.get(str(row.category_id))));
  }
  if (p === "/settings") {
    const row = await one("SELECT * FROM settings WHERE user_id = ?", [uid]);
    if (!row) {
      return {
        id: "",
        default_currency_code: "USD",
        theme: "system",
        locale: "en-US",
        dashboard_widgets: [...DEFAULT_DASHBOARD_WIDGETS],
        dashboard_widget_views: {},
        dashboard_widget_layout: DEFAULT_WIDGET_LAYOUT,
      } satisfies Settings;
    }
    return mapSettings(row);
  }
  if (p === "/analytics/month-overview") {
    const month = q.get("month") || todayISO().slice(0, 7);
    const [txns, deposits] = await Promise.all([transactionsAll(), depositsAll()]);
    return monthOverview(txns, deposits, month);
  }
  if (p === "/analytics/pocket") {
    const [txns, deposits] = await Promise.all([transactionsAll(), depositsAll()]);
    return pocketOverview(txns, deposits);
  }
  if (p === "/analytics/money-location-overview") {
    const month = q.get("month") || todayISO().slice(0, 7);
    return moneyLocationOverview(await transactionsAll(), month);
  }
  if (p === "/analytics/spend-by-category") {
    const month = q.get("month") || todayISO().slice(0, 7);
    const [txns, cats] = await Promise.all([transactionsAll(), categoriesAll()]);
    return spendByCategory(txns, cats, month, q.get("currency") ?? undefined);
  }
  if (p === "/analytics/goals-progress") {
    const [goals, txns] = await Promise.all([goalsAll(), transactionsAll()]);
    return goalsProgress(goals, txns);
  }
  if (p === "/analytics/deposits-summary") {
    return depositsSummary(await depositsAll());
  }
  if (p === "/analytics/credits-debts-summary") {
    const [items, txns] = await Promise.all([creditsAll(), transactionsAll()]);
    return creditsDebtsSummary(items, txns);
  }
  if (p === "/analytics/trends") {
    return trends(await transactionsAll(), Number(q.get("months") || 12));
  }
  if (p === "/analytics/by-currency") {
    const month = q.get("month") || todayISO().slice(0, 7);
    return byCurrency(await transactionsAll(), month);
  }
  throw new Error(`Unknown GET ${p}`);
}

export async function handlePost(path: string, body: unknown): Promise<unknown> {
  const url = new URL(path, "https://local");
  const p = url.pathname;
  const { userId: uid } = requireDb();
  const payload = (body ?? {}) as Record<string, unknown>;
  const ts = nowIso();

  if (p === "/categories") {
    const id = newId();
    await exec(
      `INSERT INTO categories (id, user_id, name, type, color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        uid,
        String(payload.name).trim(),
        payload.type,
        payload.color || "#5B8C5A",
        ts,
        ts,
      ],
    );
    return categoryById(id);
  }
  if (p === "/currencies") {
    const code = String(payload.code || "").trim().toUpperCase();
    if (code.length !== 3) throw new Error("Currency code must be 3 letters");
    const name =
      String(payload.name || "") ||
      ISO_CURRENCY_CATALOG.find((c) => c.code === code)?.name ||
      code;
    const id = newId();
    await exec(
      `INSERT INTO currencies (id, user_id, code, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, uid, code, name, ts, ts],
    );
    return { id, code, name, created_at: ts };
  }
  if (p === "/transactions") {
    const id = await insertTransaction({
      amount: asInt(payload.amount),
      currency_code: String(payload.currency_code),
      date: String(payload.date),
      type: payload.type as CategoryType,
      category_id: String(payload.category_id),
      money_location: String(payload.money_location || "card"),
      note: (payload.note as string | null) ?? null,
      goal_id: payload.goal_id ? String(payload.goal_id) : null,
      credit_debt_id: payload.credit_debt_id ? String(payload.credit_debt_id) : null,
    });
    const txns = await transactionsAll();
    return txns.find((t) => t.id === id);
  }
  if (p === "/budgets") {
    const id = newId();
    await exec(
      `INSERT INTO budgets (id, user_id, category_id, limit_cents, currency_code, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        uid,
        String(payload.category_id),
        asInt(payload.limit_cents),
        String(payload.currency_code).toUpperCase(),
        ts,
        ts,
      ],
    );
    return (await handleGet(`/budgets?month=${url.searchParams.get("month") || todayISO().slice(0, 7)}`) as Budget[])
      .find((b) => b.id === id);
  }
  if (p === "/goals") {
    const id = newId();
    await exec(
      `INSERT INTO goals (id, user_id, name, target_amount, current_amount, currency_code, deadline, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, 'active', ?, ?)`,
      [
        id,
        uid,
        String(payload.name).trim(),
        asInt(payload.target_amount),
        String(payload.currency_code).toUpperCase(),
        payload.deadline ? isoDate(payload.deadline) : null,
        ts,
        ts,
      ],
    );
    const initial = asInt(payload.current_amount);
    if (initial > 0) {
      const cat = await categoryByName("Goals", "expense");
      await insertTransaction({
        amount: initial,
        currency_code: String(payload.currency_code),
        date: todayISO(),
        type: "expense",
        category_id: cat.id,
        note: `Saved toward ${String(payload.name).trim()}`,
        goal_id: id,
        money_location: "card",
      });
    }
    return (await goalsAll()).find((g) => g.id === id);
  }
  if (p.endsWith("/contribute")) {
    const id = p.split("/")[2];
    const goal = (await goalsAll()).find((g) => g.id === id);
    if (!goal) throw new Error("Goal not found");
    const cat = payload.category_id
      ? await categoryById(String(payload.category_id))
      : await categoryByName("Goals", "expense");
    await insertTransaction({
      amount: asInt(payload.amount),
      currency_code: goal.currency_code,
      date: payload.date ? isoDate(payload.date) : todayISO(),
      type: "expense",
      category_id: cat.id,
      money_location: String(payload.money_location || "card"),
      note: (payload.note as string | null) ?? null,
      goal_id: id,
    });
    return (await goalsAll()).find((g) => g.id === id);
  }
  if (p.endsWith("/complete") && p.startsWith("/goals/")) {
    const id = p.split("/")[2];
    await exec("UPDATE goals SET status = 'completed', updated_at = ? WHERE id = ?", [
      ts,
      id,
    ]);
    return (await goalsAll()).find((g) => g.id === id);
  }
  if (p === "/deposits") {
    const id = newId();
    await exec(
      `INSERT INTO deposits (
        id, user_id, name, type, principal_cents, currency_code, start_date, end_date,
        annual_rate_bps, counterparty, note, status, money_location, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
      [
        id,
        uid,
        String(payload.name).trim(),
        payload.type,
        asInt(payload.principal_cents),
        String(payload.currency_code).toUpperCase(),
        isoDate(payload.start_date),
        isoDate(payload.end_date),
        payload.annual_rate_bps == null ? null : asInt(payload.annual_rate_bps),
        payload.counterparty ?? null,
        payload.note ?? null,
        payload.money_location === "cash" ? "cash" : "card",
        ts,
        ts,
      ],
    );
    return (await depositsAll()).find((d) => d.id === id);
  }
  if (p.startsWith("/deposits/") && p.endsWith("/complete")) {
    const id = p.split("/")[2];
    const deposit = (await depositsAll()).find((d) => d.id === id);
    if (!deposit) throw new Error("Deposit not found");
    const cat = await categoryByName("Deposit return", "income");
    await insertTransaction({
      amount: deposit.current_value_cents,
      currency_code: deposit.currency_code,
      date: todayISO(),
      type: "income",
      category_id: cat.id,
      money_location: deposit.money_location,
      note: `Return of ${deposit.name}`,
    });
    const status = deposit.type === "bank" ? "matured" : "returned";
    await exec("UPDATE deposits SET status = ?, updated_at = ? WHERE id = ?", [
      status,
      ts,
      id,
    ]);
    return (await depositsAll()).find((d) => d.id === id);
  }
  if (p === "/credits-debts") {
    const id = newId();
    const direction = payload.direction as CreditDebt["direction"];
    await exec(
      `INSERT INTO credit_debts (
        id, user_id, name, direction, source, principal_cents, currency_code,
        start_date, due_date, annual_rate_bps, counterparty, note, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      [
        id,
        uid,
        String(payload.name).trim(),
        direction,
        payload.source,
        asInt(payload.principal_cents),
        String(payload.currency_code).toUpperCase(),
        isoDate(payload.start_date),
        payload.due_date ? isoDate(payload.due_date) : null,
        payload.annual_rate_bps == null ? null : asInt(payload.annual_rate_bps),
        payload.counterparty ?? null,
        payload.note ?? null,
        ts,
        ts,
      ],
    );
    const openType = openingTxnType(direction);
    const catName = direction === "credit" ? "Lent" : "Borrowed";
    const cat = await categoryByName(catName, openType);
    await insertTransaction({
      amount: asInt(payload.principal_cents),
      currency_code: String(payload.currency_code),
      date: isoDate(payload.start_date),
      type: openType,
      category_id: cat.id,
      money_location: "card",
      note: String(payload.name),
      credit_debt_id: id,
    });
    return (await creditsAll()).find((c) => c.id === id);
  }
  if (p.startsWith("/credits-debts/") && p.endsWith("/pay")) {
    const id = p.split("/")[2];
    const item = (await creditsAll()).find((c) => c.id === id);
    if (!item) throw new Error("Credit or debt not found");
    const payType = paymentTxnType(item.direction);
    const catName = item.direction === "credit" ? "Credit repayment" : "Debt payment";
    const cat = await categoryByName(catName, payType);
    await insertTransaction({
      amount: asInt(payload.amount),
      currency_code: item.currency_code,
      date: payload.date ? isoDate(payload.date) : todayISO(),
      type: payType,
      category_id: cat.id,
      money_location: String(payload.money_location || "card"),
      note: (payload.note as string | null) ?? null,
      credit_debt_id: id,
    });
    return (await creditsAll()).find((c) => c.id === id);
  }
  if (p === "/recurring") {
    const id = newId();
    await exec(
      `INSERT INTO recurring_rules (
        id, user_id, amount, currency_code, category_id, type, cadence, billing_day,
        next_run_date, note, active, money_location, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [
        id,
        uid,
        asInt(payload.amount),
        String(payload.currency_code).toUpperCase(),
        String(payload.category_id),
        payload.type,
        payload.cadence,
        asInt(payload.billing_day, 1),
        isoDate(payload.next_run_date),
        payload.note ?? null,
        payload.money_location === "cash" ? "cash" : "card",
        ts,
        ts,
      ],
    );
    const rules = (await handleGet("/recurring")) as RecurringRule[];
    return rules.find((r) => r.id === id);
  }
  if (p === "/recurring/process") {
    const { error, data } = await supabase.rpc("process_due_recurring_rules");
    if (error) {
      return { created: 0, offline: true };
    }
    return { created: data ?? 0 };
  }
  throw new Error(`Unknown POST ${p}`);
}

export async function handlePatch(path: string, body: unknown): Promise<unknown> {
  const url = new URL(path, "https://local");
  const p = url.pathname;
  const payload = (body ?? {}) as Record<string, unknown>;
  const ts = nowIso();

  if (p.startsWith("/categories/")) {
    const id = p.split("/")[2];
    const current = await categoryById(id);
    await exec(
      "UPDATE categories SET name = ?, type = ?, color = ?, updated_at = ? WHERE id = ?",
      [
        payload.name != null ? String(payload.name).trim() : current.name,
        payload.type ?? current.type,
        payload.color ?? current.color,
        ts,
        id,
      ],
    );
    return categoryById(id);
  }
  if (p.startsWith("/transactions/")) {
    const id = p.split("/")[2];
    const existing = (await transactionsAll()).find((t) => t.id === id);
    if (!existing) throw new Error("Transaction not found");
    const next = {
      amount: payload.amount != null ? asInt(payload.amount) : existing.amount,
      currency_code: payload.currency_code
        ? String(payload.currency_code).toUpperCase()
        : existing.currency_code,
      date: payload.date ? isoDate(payload.date) : existing.date,
      type: (payload.type as CategoryType) ?? existing.type,
      category_id: payload.category_id
        ? String(payload.category_id)
        : existing.category_id,
      money_location:
        payload.money_location != null
          ? String(payload.money_location)
          : existing.money_location,
      note: payload.note !== undefined ? (payload.note as string | null) : existing.note,
      goal_id:
        payload.goal_id !== undefined
          ? payload.goal_id
            ? String(payload.goal_id)
            : null
          : existing.goal_id ?? null,
      credit_debt_id:
        payload.credit_debt_id !== undefined
          ? payload.credit_debt_id
            ? String(payload.credit_debt_id)
            : null
          : existing.credit_debt_id ?? null,
    };
    await exec(
      `UPDATE transactions SET amount = ?, currency_code = ?, date = ?, type = ?,
       category_id = ?, note = ?, goal_id = ?, credit_debt_id = ?, money_location = ?, updated_at = ?
       WHERE id = ?`,
      [
        next.amount,
        next.currency_code,
        next.date,
        next.type,
        next.category_id,
        next.note,
        next.goal_id,
        next.credit_debt_id,
        next.money_location,
        ts,
        id,
      ],
    );
    await syncGoalAmount(existing.goal_id);
    await syncGoalAmount(next.goal_id);
    await syncCreditStatus(existing.credit_debt_id);
    await syncCreditStatus(next.credit_debt_id);
    return (await transactionsAll()).find((t) => t.id === id);
  }
  if (p.startsWith("/budgets/")) {
    const id = p.split("/")[2];
    await exec(
      "UPDATE budgets SET category_id = COALESCE(?, category_id), limit_cents = COALESCE(?, limit_cents), currency_code = COALESCE(?, currency_code), updated_at = ? WHERE id = ?",
      [
        payload.category_id ? String(payload.category_id) : null,
        payload.limit_cents != null ? asInt(payload.limit_cents) : null,
        payload.currency_code ? String(payload.currency_code).toUpperCase() : null,
        ts,
        id,
      ],
    );
    const month = url.searchParams.get("month") || todayISO().slice(0, 7);
    return ((await handleGet(`/budgets?month=${month}`)) as Budget[]).find((b) => b.id === id);
  }
  if (p.startsWith("/goals/")) {
    const id = p.split("/")[2];
    await exec(
      `UPDATE goals SET
        name = COALESCE(?, name),
        target_amount = COALESCE(?, target_amount),
        deadline = COALESCE(?, deadline),
        status = COALESCE(?, status),
        currency_code = COALESCE(?, currency_code),
        updated_at = ?
       WHERE id = ?`,
      [
        payload.name != null ? String(payload.name).trim() : null,
        payload.target_amount != null ? asInt(payload.target_amount) : null,
        payload.deadline ? isoDate(payload.deadline) : null,
        payload.status != null ? String(payload.status) : null,
        payload.currency_code ? String(payload.currency_code).toUpperCase() : null,
        ts,
        id,
      ],
    );
    return (await goalsAll()).find((g) => g.id === id);
  }
  if (p.startsWith("/recurring/")) {
    const id = p.split("/")[2];
    const active =
      payload.active === undefined ? null : asBool(payload.active) ? 1 : 0;
    await exec(
      `UPDATE recurring_rules SET
        amount = COALESCE(?, amount),
        currency_code = COALESCE(?, currency_code),
        category_id = COALESCE(?, category_id),
        type = COALESCE(?, type),
        cadence = COALESCE(?, cadence),
        billing_day = COALESCE(?, billing_day),
        next_run_date = COALESCE(?, next_run_date),
        note = COALESCE(?, note),
        active = COALESCE(?, active),
        money_location = COALESCE(?, money_location),
        updated_at = ?
       WHERE id = ?`,
      [
        payload.amount != null ? asInt(payload.amount) : null,
        payload.currency_code ? String(payload.currency_code).toUpperCase() : null,
        payload.category_id ? String(payload.category_id) : null,
        payload.type != null ? String(payload.type) : null,
        payload.cadence != null ? String(payload.cadence) : null,
        payload.billing_day != null ? asInt(payload.billing_day) : null,
        payload.next_run_date ? isoDate(payload.next_run_date) : null,
        payload.note !== undefined ? payload.note : null,
        active,
        payload.money_location != null ? String(payload.money_location) : null,
        ts,
        id,
      ],
    );
    return ((await handleGet("/recurring")) as RecurringRule[]).find((r) => r.id === id);
  }
  if (p === "/settings") {
    const current = (await handleGet("/settings")) as Settings;
    const next: Settings = {
      ...current,
      default_currency_code:
        (payload.default_currency_code as string) ?? current.default_currency_code,
      theme: (payload.theme as Settings["theme"]) ?? current.theme,
      locale: (payload.locale as string) ?? current.locale,
      dashboard_widgets:
        (payload.dashboard_widgets as string[]) ?? current.dashboard_widgets,
      dashboard_widget_views:
        (payload.dashboard_widget_views as Record<string, string>) ??
        current.dashboard_widget_views,
      dashboard_widget_layout:
        (payload.dashboard_widget_layout as unknown[]) ?? current.dashboard_widget_layout,
    };
    if (!current.id) {
      const id = newId();
      await exec(
        `INSERT INTO settings (
          id, user_id, default_currency_code, theme, locale, dashboard_widgets,
          stats_charts, dashboard_widget_views, dashboard_widget_layout, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          requireDb().userId,
          next.default_currency_code,
          next.theme,
          next.locale,
          JSON.stringify(next.dashboard_widgets),
          JSON.stringify(next.stats_charts ?? []),
          JSON.stringify(next.dashboard_widget_views),
          JSON.stringify(next.dashboard_widget_layout),
          ts,
          ts,
        ],
      );
      next.id = id;
      return next;
    }
    await exec(
      `UPDATE settings SET default_currency_code = ?, theme = ?, locale = ?,
       dashboard_widgets = ?, dashboard_widget_views = ?, dashboard_widget_layout = ?, updated_at = ?
       WHERE id = ?`,
      [
        next.default_currency_code,
        next.theme,
        next.locale,
        JSON.stringify(next.dashboard_widgets),
        JSON.stringify(next.dashboard_widget_views),
        JSON.stringify(next.dashboard_widget_layout),
        ts,
        current.id,
      ],
    );
    return next;
  }
  throw new Error(`Unknown PATCH ${p}`);
}

export async function handleDelete(path: string): Promise<void> {
  const p = new URL(path, "https://local").pathname;
  if (p.startsWith("/categories/")) {
    await exec("DELETE FROM categories WHERE id = ?", [p.split("/")[2]]);
    return;
  }
  if (p.startsWith("/currencies/")) {
    const code = decodeURIComponent(p.split("/")[2]);
    const { userId: uid } = requireDb();
    await exec("DELETE FROM currencies WHERE user_id = ? AND code = ?", [uid, code]);
    return;
  }
  if (p.startsWith("/transactions/")) {
    const id = p.split("/")[2];
    const existing = (await transactionsAll()).find((t) => t.id === id);
    await exec("DELETE FROM transactions WHERE id = ?", [id]);
    await syncGoalAmount(existing?.goal_id);
    await syncCreditStatus(existing?.credit_debt_id);
    return;
  }
  if (p.startsWith("/budgets/")) {
    await exec("DELETE FROM budgets WHERE id = ?", [p.split("/")[2]]);
    return;
  }
  if (p.startsWith("/goals/")) {
    await exec("DELETE FROM goals WHERE id = ?", [p.split("/")[2]]);
    return;
  }
  if (p.startsWith("/deposits/")) {
    await exec("DELETE FROM deposits WHERE id = ?", [p.split("/")[2]]);
    return;
  }
  if (p.startsWith("/credits-debts/")) {
    await exec("DELETE FROM credit_debts WHERE id = ?", [p.split("/")[2]]);
    return;
  }
  if (p.startsWith("/recurring/")) {
    await exec("DELETE FROM recurring_rules WHERE id = ?", [p.split("/")[2]]);
    return;
  }
  throw new Error(`Unknown DELETE ${p}`);
}
