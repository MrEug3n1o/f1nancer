import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import type {
  AbstractPowerSyncDatabase,
  PowerSyncBackendConnector,
} from "@powersync/web";
import { UpdateType } from "@powersync/web";
import { supabaseAnonKey, supabaseUrl } from "./config";

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

const BOOL_FIELDS: Record<string, string[]> = {
  recurring_rules: ["active"],
};

const INT_FIELDS: Record<string, string[]> = {
  transactions: ["amount"],
  budgets: ["limit_cents"],
  goals: ["target_amount", "current_amount"],
  deposits: ["principal_cents", "annual_rate_bps"],
  credit_debts: ["principal_cents", "annual_rate_bps"],
  recurring_rules: ["amount", "billing_day", "active"],
};

function coerceRecord(table: string, data: Record<string, unknown> | null) {
  if (!data) return data;
  const next = { ...data };
  for (const key of BOOL_FIELDS[table] ?? []) {
    if (key in next) next[key] = Boolean(next[key]);
  }
  for (const key of INT_FIELDS[table] ?? []) {
    if (next[key] === "" || next[key] === undefined) next[key] = null;
  }
  for (const [key, value] of Object.entries(next)) {
    if (value === "") next[key] = null;
  }
  return next;
}

export class SupabaseConnector implements PowerSyncBackendConnector {
  async fetchCredentials() {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session) {
      throw new Error("Not signed in");
    }
    const endpoint = import.meta.env.VITE_POWERSYNC_URL as string;
    return {
      endpoint,
      token: session.access_token,
    };
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;

    try {
      for (const op of transaction.crud) {
        const table = supabase.from(op.table);
        const record = coerceRecord(op.table, { ...(op.opData ?? {}), id: op.id }) ?? {};
        let error;
        if (op.op === UpdateType.PUT) {
          ({ error } = await table.upsert(record));
        } else if (op.op === UpdateType.PATCH) {
          ({ error } = await table.update(coerceRecord(op.table, op.opData ?? {}) ?? {}).eq("id", op.id));
        } else if (op.op === UpdateType.DELETE) {
          ({ error } = await table.delete().eq("id", op.id));
        }
        if (error) throw error;
      }
      await transaction.complete();
    } catch (err) {
      console.error("PowerSync upload failed", err);
      throw err;
    }
  }
}

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}
