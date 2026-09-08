const BOOL_FIELDS: Record<string, string[]> = {
  recurring_rules: ["active"],
};

const INT_FIELDS: Record<string, string[]> = {
  transactions: ["amount"],
  budgets: ["limit_cents"],
  goals: ["target_amount", "current_amount"],
  deposits: ["principal_cents", "annual_rate_bps"],
  credit_debts: ["principal_cents", "annual_rate_bps"],
  recurring_rules: ["amount", "billing_day"],
};

/**
 * Normalize a PowerSync CRUD payload for Supabase upsert/update.
 * Only mutates keys that are already present — never invents nulls for
 * omitted columns (partial PATCH ops must stay partial).
 */
export function coerceSyncRecord(
  table: string,
  data: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!data) return {};
  const next: Record<string, unknown> = { ...data };
  for (const key of BOOL_FIELDS[table] ?? []) {
    if (key in next) next[key] = Boolean(next[key]);
  }
  for (const key of INT_FIELDS[table] ?? []) {
    if (!(key in next)) continue;
    if (next[key] === "" || next[key] === undefined) next[key] = null;
  }
  for (const [key, value] of Object.entries(next)) {
    if (value === "") next[key] = null;
  }
  return next;
}
