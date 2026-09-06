import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import {
  UpdateType,
  type AbstractPowerSyncDatabase,
  type PowerSyncBackendConnector,
} from "@powersync/react-native";
import { supabaseAnonKey, supabaseUrl } from "./config";

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: AsyncStorage,
    detectSessionInUrl: false,
  },
});

function coerce(table: string, data: Record<string, unknown> | null) {
  if (!data) return data;
  const next = { ...data };
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
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error("Not signed in");
    return {
      endpoint: process.env.EXPO_PUBLIC_POWERSYNC_URL as string,
      token: data.session.access_token,
    };
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;
    try {
      for (const op of transaction.crud) {
        const table = supabase.from(op.table);
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
  const { data } = await supabase.auth.getSession();
  return data.session;
}
