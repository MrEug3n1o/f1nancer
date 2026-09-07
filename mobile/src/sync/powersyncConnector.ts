import {
  UpdateType,
  type AbstractPowerSyncDatabase,
  type PowerSyncBackendConnector,
} from "@powersync/common";
import { powerSyncUrl } from "./config";
import { getSupabase } from "./supabaseClient";

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

/** Import this only when PowerSync is needed. */
export class SupabaseConnector implements PowerSyncBackendConnector {
  async fetchCredentials() {
    const { data } = await getSupabase().auth.getSession();
    if (!data.session) throw new Error("Not signed in");
    return {
      endpoint: powerSyncUrl,
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
