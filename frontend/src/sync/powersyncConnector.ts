import { asSyncedTable, coerceSyncRecord, isUniqueConstraintError } from "@f1nancer/domain";
import type {
  AbstractPowerSyncDatabase,
  PowerSyncBackendConnector,
} from "@powersync/web";
import { UpdateType } from "@powersync/web";
import { powerSyncUrl } from "./config";
import { getSupabase } from "./supabaseClient";

/** Import this only when PowerSync is needed — pulls in wa-sqlite / WASM. */
export class SupabaseConnector implements PowerSyncBackendConnector {
  async fetchCredentials() {
    const { data } = await getSupabase().auth.getSession();
    const session = data.session;
    if (!session) {
      throw new Error("Not signed in");
    }
    return {
      endpoint: powerSyncUrl,
      token: session.access_token,
    };
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;
    const client = getSupabase();

    try {
      for (const op of transaction.crud) {
        const table = client.from(op.table);
        const record = coerceSyncRecord(op.table, { ...(op.opData ?? {}), id: op.id });
        let error;
        if (op.op === UpdateType.PUT) {
          ({ error } = await table.upsert(record));
        } else if (op.op === UpdateType.PATCH) {
          ({ error } = await table.update(coerceSyncRecord(op.table, op.opData)).eq("id", op.id));
        } else if (op.op === UpdateType.DELETE) {
          ({ error } = await table.delete().eq("id", op.id));
        }
        if (error) {
          if (op.op === UpdateType.PUT && isUniqueConstraintError(error)) {
            const tableName = asSyncedTable(op.table);
            if (tableName) {
              await database.execute(`DELETE FROM ${tableName} WHERE id = ?`, [op.id]);
            }
            continue;
          }
          throw error;
        }
      }
      await transaction.complete();
    } catch (err) {
      console.error("PowerSync upload failed", err);
      throw err;
    }
  }
}
