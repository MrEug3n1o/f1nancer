import { inMonth, isoMonth, monthBounds } from "./dates";
import {
  enrichCreditDebt,
  enrichDeposit,
  goalProgressPct,
  goalSavedCents,
} from "./finance";
import type {
  Budget,
  Category,
  CategorySpend,
  CreditDebt,
  CreditDebtSummaryItem,
  CurrencyMonthSplit,
  Deposit,
  DepositSummaryItem,
  Goal,
  GoalProgress,
  MoneyLocationOverview,
  MonthOverview,
  PocketOverview,
  Transaction,
  TrendPoint,
} from "./types";

function locOf(value: string | null | undefined): "cash" | "card" {
  return value === "cash" ? "cash" : "card";
}

function sumByCurrencyLocation(
  rows: Array<{ currency_code: string; money_location?: string; amount: number }>,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.currency_code}|${locOf(row.money_location)}`;
    map.set(key, (map.get(key) ?? 0) + row.amount);
  }
  return map;
}

function currencyNetOverviews(
  transactions: Transaction[],
  deposits: Deposit[],
  start?: string,
  end?: string,
) {
  const inRange = (iso: string) =>
    (!start || iso.slice(0, 10) >= start) && (!end || iso.slice(0, 10) <= end);

  const income = sumByCurrencyLocation(
    transactions.filter((t) => t.type === "income" && inRange(t.date)).map((t) => ({
      currency_code: t.currency_code,
      money_location: t.money_location,
      amount: t.amount,
    })),
  );
  const expense = sumByCurrencyLocation(
    transactions.filter((t) => t.type === "expense" && inRange(t.date)).map((t) => ({
      currency_code: t.currency_code,
      money_location: t.money_location,
      amount: t.amount,
    })),
  );
  const deposited = sumByCurrencyLocation(
    deposits
      .filter((d) => d.status !== "cancelled" && inRange(d.start_date))
      .map((d) => ({
        currency_code: d.currency_code,
        money_location: d.money_location,
        amount: d.principal_cents,
      })),
  );

  const codes = new Set<string>();
  for (const key of [...income.keys(), ...expense.keys(), ...deposited.keys()]) {
    codes.add(key.split("|")[0]);
  }

  return [...codes].sort().map((code) => {
    const cashIncome = income.get(`${code}|cash`) ?? 0;
    const cardIncome = income.get(`${code}|card`) ?? 0;
    const cashExpense = expense.get(`${code}|cash`) ?? 0;
    const cardExpense = expense.get(`${code}|card`) ?? 0;
    const cashDeposited = deposited.get(`${code}|cash`) ?? 0;
    const cardDeposited = deposited.get(`${code}|card`) ?? 0;
    const cashNet = cashIncome - cashExpense - cashDeposited;
    const cardNet = cardIncome - cardExpense - cardDeposited;
    const incomeCents = cashIncome + cardIncome;
    const expenseCents = cashExpense + cardExpense;
    const depositedCents = cashDeposited + cardDeposited;
    return {
      currency_code: code,
      income_cents: incomeCents,
      expense_cents: expenseCents,
      net_cents: incomeCents - expenseCents - depositedCents,
      cash_net_cents: cashNet,
      card_net_cents: cardNet,
    };
  });
}

export function monthOverview(
  transactions: Transaction[],
  deposits: Deposit[],
  month: string,
): MonthOverview {
  const { start, end } = monthBounds(month);
  return {
    month,
    currencies: currencyNetOverviews(transactions, deposits, start, end),
  };
}

export function pocketOverview(
  transactions: Transaction[],
  deposits: Deposit[],
): PocketOverview {
  return { currencies: currencyNetOverviews(transactions, deposits) };
}

export function moneyLocationOverview(
  transactions: Transaction[],
  month: string,
): MoneyLocationOverview {
  const { start, end } = monthBounds(month);
  const inRange = (iso: string) =>
    iso.slice(0, 10) >= start && iso.slice(0, 10) <= end;
  const income = sumByCurrencyLocation(
    transactions.filter((t) => t.type === "income" && inRange(t.date)).map((t) => ({
      currency_code: t.currency_code,
      money_location: t.money_location,
      amount: t.amount,
    })),
  );
  const expense = sumByCurrencyLocation(
    transactions.filter((t) => t.type === "expense" && inRange(t.date)).map((t) => ({
      currency_code: t.currency_code,
      money_location: t.money_location,
      amount: t.amount,
    })),
  );
  const codes = new Set<string>();
  for (const key of [...income.keys(), ...expense.keys()]) {
    codes.add(key.split("|")[0]);
  }
  return {
    month,
    currencies: [...codes].sort().map((code) => ({
      currency_code: code,
      cash: {
        income_cents: income.get(`${code}|cash`) ?? 0,
        expense_cents: expense.get(`${code}|cash`) ?? 0,
      },
      card: {
        income_cents: income.get(`${code}|card`) ?? 0,
        expense_cents: expense.get(`${code}|card`) ?? 0,
      },
    })),
  };
}

export function spendByCategory(
  transactions: Transaction[],
  categories: Category[],
  month: string,
  currency?: string,
): CategorySpend[] {
  const catById = new Map(categories.map((c) => [c.id, c]));
  const bucket = new Map<string, CategorySpend>();
  for (const t of transactions) {
    if (t.type !== "expense" || !inMonth(t.date, month)) continue;
    if (currency && t.currency_code !== currency.toUpperCase()) continue;
    const cat = catById.get(t.category_id);
    const key = `${t.category_id}|${t.currency_code}`;
    const existing = bucket.get(key);
    if (existing) {
      existing.total_cents += t.amount;
    } else {
      bucket.set(key, {
        category_id: t.category_id,
        category_name: cat?.name ?? "Unknown",
        color: cat?.color ?? "#495057",
        currency_code: t.currency_code,
        total_cents: t.amount,
      });
    }
  }
  return [...bucket.values()].sort((a, b) => b.total_cents - a.total_cents);
}

export function goalsProgress(goals: Goal[], transactions: Transaction[]): GoalProgress[] {
  return goals
    .filter((g) => g.status !== "cancelled")
    .map((g) => {
      const saved = goalSavedCents(transactions, g.id);
      return {
        id: g.id,
        name: g.name,
        target_amount: g.target_amount,
        current_amount: saved,
        currency_code: g.currency_code,
        progress_pct: goalProgressPct(saved, g.target_amount),
        status: g.status,
        deadline: g.deadline,
      };
    });
}

export function depositsSummary(deposits: Deposit[]): DepositSummaryItem[] {
  const bucket = new Map<string, DepositSummaryItem>();
  for (const raw of deposits.filter((d) => d.status === "active")) {
    const d = enrichDeposit(raw);
    const row = bucket.get(d.currency_code) ?? {
      currency_code: d.currency_code,
      active_count: 0,
      principal_cents: 0,
      current_value_cents: 0,
    };
    row.active_count += 1;
    row.principal_cents += d.principal_cents;
    row.current_value_cents += d.current_value_cents;
    bucket.set(d.currency_code, row);
  }
  return [...bucket.values()].sort((a, b) =>
    a.currency_code.localeCompare(b.currency_code),
  );
}

export function creditsDebtsSummary(
  items: CreditDebt[],
  transactions: Transaction[],
): CreditDebtSummaryItem[] {
  const bucket = new Map<string, CreditDebtSummaryItem>();
  for (const raw of items.filter((i) => i.status === "active")) {
    const item = enrichCreditDebt(raw, transactions);
    const row = bucket.get(item.currency_code) ?? {
      currency_code: item.currency_code,
      credit_count: 0,
      debt_count: 0,
      credit_remaining_cents: 0,
      debt_remaining_cents: 0,
    };
    if (item.direction === "credit") {
      row.credit_count += 1;
      row.credit_remaining_cents += item.remaining_cents;
    } else {
      row.debt_count += 1;
      row.debt_remaining_cents += item.remaining_cents;
    }
    bucket.set(item.currency_code, row);
  }
  return [...bucket.values()].sort((a, b) =>
    a.currency_code.localeCompare(b.currency_code),
  );
}

export function trends(transactions: Transaction[], months = 12): TrendPoint[] {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const startIso = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;
  const bucket = new Map<string, TrendPoint>();
  for (const t of transactions) {
    if (t.date.slice(0, 10) < startIso) continue;
    const month = isoMonth(t.date);
    const key = `${month}|${t.currency_code}`;
    const point = bucket.get(key) ?? {
      month,
      currency_code: t.currency_code,
      income_cents: 0,
      expense_cents: 0,
    };
    if (t.type === "income") point.income_cents += t.amount;
    if (t.type === "expense") point.expense_cents += t.amount;
    bucket.set(key, point);
  }
  return [...bucket.values()].sort((a, b) =>
    a.month === b.month
      ? a.currency_code.localeCompare(b.currency_code)
      : a.month.localeCompare(b.month),
  );
}

export function byCurrency(
  transactions: Transaction[],
  month: string,
): CurrencyMonthSplit[] {
  const bucket = new Map<string, CurrencyMonthSplit>();
  for (const t of transactions) {
    if (!inMonth(t.date, month)) continue;
    const row = bucket.get(t.currency_code) ?? {
      currency_code: t.currency_code,
      income_cents: 0,
      expense_cents: 0,
    };
    if (t.type === "income") row.income_cents += t.amount;
    if (t.type === "expense") row.expense_cents += t.amount;
    bucket.set(t.currency_code, row);
  }
  return [...bucket.values()].sort((a, b) =>
    a.currency_code.localeCompare(b.currency_code),
  );
}

export function budgetSpentCents(
  transactions: Transaction[],
  categoryId: string,
  month: string,
  currencyCode: string,
): number {
  return transactions
    .filter(
      (t) =>
        t.category_id === categoryId &&
        t.type === "expense" &&
        t.currency_code === currencyCode &&
        inMonth(t.date, month),
    )
    .reduce((sum, t) => sum + t.amount, 0);
}

export function enrichBudget(
  budget: Omit<Budget, "spent_cents" | "month" | "category"> & {
    category?: Category | null;
  },
  transactions: Transaction[],
  month: string,
): Budget {
  return {
    ...budget,
    month,
    spent_cents: budgetSpentCents(
      transactions,
      budget.category_id,
      month,
      budget.currency_code,
    ),
  };
}
