import {
  asInt,
  formatMoney,
  monthOverview,
  pocketOverview,
  todayISO,
  type Category,
  type CategoryType,
  type MoneyLocation,
  type MonthOverview,
  type PocketOverview,
  type Transaction,
} from "@f1nancer/domain";
import { powerSync } from "../sync/database";

type Row = Record<string, unknown>;

function str(value: unknown) {
  return String(value ?? "");
}

export async function loadCategories(userId: string): Promise<Category[]> {
  const rows = await powerSync.getAll<Row>(
    "SELECT * FROM categories WHERE user_id = ? ORDER BY name",
    [userId],
  );
  return rows.map((row) => ({
    id: str(row.id),
    name: str(row.name),
    type: str(row.type) as CategoryType,
    color: str(row.color),
  }));
}

export async function loadTransactions(userId: string): Promise<Transaction[]> {
  const rows = await powerSync.getAll<Row>(
    "SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC, id DESC",
    [userId],
  );
  return rows.map((row) => ({
    id: str(row.id),
    amount: asInt(row.amount),
    currency_code: str(row.currency_code),
    date: str(row.date).slice(0, 10),
    type: str(row.type) as CategoryType,
    category_id: str(row.category_id),
    money_location: str(row.money_location) === "cash" ? "cash" : "card",
    note: row.note == null ? null : str(row.note),
    recurring_id: row.recurring_id == null ? null : str(row.recurring_id),
    goal_id: row.goal_id == null ? null : str(row.goal_id),
    credit_debt_id: row.credit_debt_id == null ? null : str(row.credit_debt_id),
    created_at: str(row.created_at),
  }));
}

export async function loadDashboard(userId: string, month: string): Promise<{
  pocket: PocketOverview;
  month: MonthOverview;
  transactions: Transaction[];
  categories: Category[];
}> {
  const [transactions, categories] = await Promise.all([
    loadTransactions(userId),
    loadCategories(userId),
  ]);
  const deposits: never[] = [];
  return {
    pocket: pocketOverview(transactions, deposits),
    month: monthOverview(transactions, deposits, month),
    transactions,
    categories,
  };
}

export async function createCategory(
  userId: string,
  name: string,
  type: CategoryType,
  color: string,
) {
  const ts = new Date().toISOString();
  await powerSync.execute(
    `INSERT INTO categories (id, user_id, name, type, color, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [crypto.randomUUID(), userId, name.trim(), type, color, ts, ts],
  );
}

export async function createTransaction(
  userId: string,
  payload: {
    amount: number;
    currency_code: string;
    date: string;
    type: CategoryType;
    category_id: string;
    money_location: MoneyLocation;
    note: string | null;
  },
) {
  const ts = new Date().toISOString();
  await powerSync.execute(
    `INSERT INTO transactions (
      id, user_id, amount, currency_code, date, type, category_id, note,
      money_location, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      userId,
      payload.amount,
      payload.currency_code,
      payload.date,
      payload.type,
      payload.category_id,
      payload.note,
      payload.money_location,
      ts,
      ts,
    ],
  );
}

export { formatMoney, todayISO };
