import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import {
  UpdateType,
  type AbstractPowerSyncDatabase,
  type PowerSyncBackendConnector,
} from "@powersync/react-native";
import { isSyncConfigured, supabaseAnonKey, supabaseUrl } from "./config";

let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase;
  if (!isSyncConfigured()) {
    throw new Error("Sync is not configured. Missing EXPO_PUBLIC_SUPABASE_* / POWERSYNC_URL.");
  }
  _supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storage: AsyncStorage,
      detectSessionInUrl: false,
    },
  });
  return _supabase;
}

/** @deprecated Prefer getSupabase() — kept for call sites that already import `supabase`. */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getSupabase();
    const value = Reflect.get(client as object, prop, receiver);
    return typeof value === "function" ? (value as Function).bind(client) : value;
  },
});

function coerce(table: string, data: Record<string, unknown> | null | undefined) {
  if (!data) return {};
  const next: Record<string, unknown> = { ...data };
  if (table === "recurring_rules" && "active" in next) {
    next.active = Boolean(next.active);
  }
  for (const [key, value] of Object.entries(next)) {
    if (value === "") next[key] = null;
  }
  return next;
}

export class SupabaseConnector implements PowerSyncBackendConnector {
  async fetchCredentials() {
    const { data } = await getSupabase().auth.getSession();
    if (!data.session) throw new Error("Not signed in");
    return {
      endpoint: process.env.EXPO_PUBLIC_POWERSYNC_URL as string,
      token: data.session.access_token,
    };
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;
    const client = getSupabase();
    try {
      for (const op of transaction.crud) {
        const table = client.from(op.table);
        let error;
        if (op.op === UpdateType.PUT) {
          ({ error } = await table.upsert(coerce(op.table, { ...op.opData, id: op.id })));
        } else if (op.op === UpdateType.PATCH) {
          ({ error } = await table.update(coerce(op.table, op.opData)).eq("id", op.id));
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
  const { data } = await getSupabase().auth.getSession();
  return data.session;
}
