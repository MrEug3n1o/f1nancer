import { formatSyncError } from './syncError';
import { coerceSyncRecord } from './syncCoerce';
import { FINANCE_TABLES } from './backup';
import type { SqlWriter } from './syncStorage';

export interface UploadOperation {
  clientId: number;
  table: string;
  id: string;
  op: string;
  opData?: Record<string, unknown> | null;
  metadata?: string;
}
export interface UploadDatabase extends SqlWriter {
  getNextCrudTransaction(): Promise<{ crud: UploadOperation[]; complete(): Promise<void> } | null>;
}
export interface SyncRpc {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: any; error: any }>;
}

/** Both connectors use the same durable server acknowledgement protocol. */
export async function uploadSyncBatch(db: UploadDatabase, client: SyncRpc, instanceId: string): Promise<void> {
  const batch = await db.getNextCrudTransaction();
  if (!batch) return;
  const repairs = new Map((await db.getAll<{op_id: string; payload: string}>('SELECT op_id, payload FROM f1_upload_repairs')).map(row => [row.op_id, JSON.parse(row.payload)]));
  const operations = batch.crud.map(op => {
    if (!(FINANCE_TABLES as readonly string[]).includes(op.table)) throw new Error(`Unsupported upload table: ${op.table}`);
    if (!['PUT', 'PATCH', 'DELETE'].includes(op.op)) throw new Error(`Unsupported upload operation: ${op.op}`);
    const repair = repairs.get(String(op.clientId));
    if (repair) {
      if (repair.table !== op.table || repair.id !== op.id || repair.op_id !== String(op.clientId)) throw new Error('Upload repair identity mismatch. Local changes retained.');
      return repair;
    }
    const metadata = op.metadata ? JSON.parse(op.metadata) : {};
    return { op_id: String(op.clientId), table: op.table, id: op.id, op: op.op,
      data: coerceSyncRecord(op.table, op.op === 'PUT' && metadata.restore ? metadata.restore : op.opData), merge: metadata.merge === 'keep_existing' };
  });
  const { data, error } = await client.rpc('apply_sync_batch', { p_instance_id: instanceId, p_operations: operations });
  if (error) {
    for (const op of /^(22|23|42)/.test(String(error.code)) ? operations : []) {
      await db.execute('INSERT INTO f1_upload_failures (op_id, original, error) VALUES (?,?,?) ON CONFLICT(op_id) DO UPDATE SET error=excluded.error', [op.op_id, JSON.stringify(op), formatSyncError(error)]);
    }
    if (error.code === 'PGRST202' || error.code === '42883') throw new Error('Cloud needs the sync repair migration. Local changes are safe and will retry after the server is updated.');
    throw error;
  }
  if (!Array.isArray(data) || data.length !== operations.length || data.some((r, i) => r.op_id !== operations[i].op_id)) {
    throw new Error('Incomplete cloud acknowledgement. Local changes have been retained.');
  }
  // Persist conflict evidence before removing anything from the upload queue.
  for (let i = 0; i < data.length; i++) {
    if (data[i].conflict) {
      await db.execute('INSERT OR REPLACE INTO f1_conflicts (id, payload) VALUES (?, ?)',
        [`${instanceId}:${data[i].op_id}`, JSON.stringify({ ...data[i], operation: operations[i] })]);
    }
  }
  for (const op of operations) await db.execute('DELETE FROM f1_upload_failures WHERE op_id=?', [op.op_id]);
  await batch.complete();
}
