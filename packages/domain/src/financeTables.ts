export const FINANCE_TABLES = ['currencies', 'categories', 'settings', 'goals', 'deposits', 'credit_debts', 'recurring_rules', 'budgets', 'transactions'] as const;
export type FinanceTable = typeof FINANCE_TABLES[number];
export type FinanceRow = Record<string, string | number | null> & { id: string; user_id: string };
export type FinanceTables = Record<FinanceTable, FinanceRow[]>;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const firebaseUidPattern = /^[A-Za-z0-9_-]{1,128}$/;
const base = ['id', 'user_id', 'created_at', 'updated_at'];
export const FINANCE_COLUMNS: Record<FinanceTable, string[]> = {
  currencies: [...base, 'code', 'name'], categories: [...base, 'name', 'type', 'color'],
  settings: [...base, 'default_currency_code', 'theme', 'locale', 'dashboard_widgets', 'stats_charts', 'dashboard_widget_views', 'dashboard_widget_layout'],
  goals: [...base, 'name', 'target_amount', 'current_amount', 'currency_code', 'deadline', 'status'],
  deposits: [...base, 'name', 'type', 'principal_cents', 'currency_code', 'start_date', 'end_date', 'annual_rate_bps', 'counterparty', 'note', 'status', 'money_location'],
  credit_debts: [...base, 'name', 'direction', 'source', 'principal_cents', 'currency_code', 'start_date', 'due_date', 'annual_rate_bps', 'counterparty', 'note', 'status'],
  recurring_rules: [...base, 'amount', 'currency_code', 'category_id', 'type', 'cadence', 'billing_day', 'next_run_date', 'note', 'active', 'money_location'],
  budgets: [...base, 'category_id', 'limit_cents', 'currency_code'],
  transactions: [...base, 'amount', 'currency_code', 'date', 'type', 'category_id', 'note', 'recurring_id', 'goal_id', 'credit_debt_id', 'money_location'],
};
const nullable = new Set(['deadline', 'annual_rate_bps', 'counterparty', 'note', 'due_date', 'recurring_id', 'goal_id', 'credit_debt_id']);
const numeric = new Set(['amount', 'target_amount', 'current_amount', 'principal_cents', 'annual_rate_bps', 'billing_day', 'limit_cents', 'active']);
const enums: Record<string, Record<string, string[]>> = {
  categories: { type: ['income', 'expense'] }, transactions: { type: ['income', 'expense'], money_location: ['card', 'cash'] },
  goals: { status: ['active', 'completed', 'cancelled'] },
  deposits: { type: ['bank', 'rental'], status: ['active', 'matured', 'returned', 'cancelled'], money_location: ['card', 'cash'] },
  credit_debts: { direction: ['credit', 'debt'], source: ['bank', 'informal'], status: ['active', 'paid', 'cancelled'] },
  recurring_rules: { type: ['income', 'expense'], cadence: ['weekly', 'monthly', 'yearly'], money_location: ['card', 'cash'] },
};

/** Validates a full account snapshot (ownership, types, enums, unique keys and references) before it replaces local data. */
export function validateFinanceTables(tables: FinanceTables, accountId: string): FinanceTables {
  if (!firebaseUidPattern.test(accountId) || !tables) throw new Error('Invalid account snapshot.');
  for (const table of FINANCE_TABLES) {
    const rows = tables[table];
    if (!Array.isArray(rows)) throw new Error(`Missing table: ${table}`);
    const ids = new Set<string>(); const keys = new Set<string>();
    for (const row of rows) {
      if (!row || typeof row !== 'object' || row.user_id !== accountId || !uuidPattern.test(row.id)) throw new Error(`Invalid ownership or ID in ${table}.`);
      if (ids.has(row.id)) throw new Error(`Duplicate ID in ${table}.`);
      ids.add(row.id);
      if (Object.keys(row).some(k => !FINANCE_COLUMNS[table].includes(k))) throw new Error(`Unknown column in ${table}.`);
      for (const col of FINANCE_COLUMNS[table]) {
        const v = row[col];
        if (v === null && nullable.has(col)) continue;
        if (numeric.has(col)) {
          if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < -2147483648 || v > 2147483647) throw new Error(`Invalid number: ${table}.${col}`);
        } else if (typeof v !== 'string') throw new Error(`Invalid value: ${table}.${col}`);
        // Account ownership accepts both legacy UUIDs and Firebase UIDs. Record
        // references remain UUIDs because existing finance row IDs are preserved.
        if (col !== 'user_id' && col.endsWith('_id') && v !== null && !uuidPattern.test(String(v))) throw new Error(`Invalid reference: ${table}.${col}`);
        if ((col.endsWith('_date') || col === 'date' || col === 'deadline') && (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0, 10) !== v)) throw new Error(`Invalid date: ${table}.${col}`);
        if (col.endsWith('_at') && !Number.isFinite(Date.parse(String(v)))) throw new Error(`Invalid timestamp: ${table}.${col}`);
        if ((col === 'code' || col.endsWith('currency_code')) && !/^[A-Z]{3}$/.test(String(v))) throw new Error(`Invalid currency in ${table}.`);
        if (['dashboard_widgets', 'stats_charts', 'dashboard_widget_views', 'dashboard_widget_layout'].includes(col)) {
          let parsed; try { parsed = JSON.parse(String(v)); } catch { throw new Error(`Invalid settings JSON: ${col}`); }
          if (!parsed || typeof parsed !== 'object' || (col !== 'dashboard_widget_views' && !Array.isArray(parsed))) throw new Error(`Invalid settings: ${col}`);
        }
      }
      for (const [col, values] of Object.entries(enums[table] ?? {})) if (!values.includes(String(row[col]))) throw new Error(`Invalid ${table}.${col}`);
      if (table === 'recurring_rules' && (![0, 1].includes(Number(row.active)) || Number(row.billing_day) < 1 || Number(row.billing_day) > 31)) throw new Error('Invalid recurring rule.');
      const key = naturalKey(table, row);
      if (keys.has(key)) throw new Error(`Duplicate unique key in ${table}.`);
      keys.add(key);
    }
  }
  for (const table of FINANCE_TABLES) for (const row of tables[table]) {
    for (const [col, target] of Object.entries({ category_id: 'categories', goal_id: 'goals', credit_debt_id: 'credit_debts', recurring_id: 'recurring_rules' })) {
      if (row[col] && !tables[target as FinanceTable].some(r => r.id === row[col])) throw new Error(`Broken reference: ${table}.${col}`);
    }
  }
  return tables;
}
function naturalKey(table: FinanceTable, row: FinanceRow): string {
  if (table === 'settings') return row.user_id;
  if (table === 'currencies') return String(row.code);
  if (table === 'budgets') return `${row.category_id}:${row.currency_code}`;
  return row.id;
}
