import { BACKUP_COLUMNS, FINANCE_TABLES, validateBackup, type BackupRow, type FinanceTable } from './backup';
import { coerceSyncRecord } from './syncCoerce';
import { formatSyncError } from './syncError';
import type { SyncDatabase } from './syncStorage';
import type { UploadOperation } from './syncUpload';

export interface FirestoreUpload {
  opId: string;
  table: FinanceTable;
  id: string;
  kind: 'set' | 'delete';
  row?: BackupRow;
  previousUpdatedAt?: string;
  keepExisting: boolean;
}

export interface FirestoreApplyResult {
  opId: string;
  conflict?: boolean;
  remote?: BackupRow | null;
}

export interface FirestoreCloudAdapter {
  readAll(table: FinanceTable): Promise<BackupRow[]>;
  apply(operations: FirestoreUpload[]): Promise<FirestoreApplyResult[]>;
}

export interface FirestoreSyncResult {
  uploaded: number;
  downloaded: number;
  conflicts: number;
  syncedAt: string;
}

type CrudTransaction = {
  crud: UploadOperation[];
  complete(): Promise<void>;
};

type FirestoreLocalDatabase = SyncDatabase & {
  getNextCrudTransaction(): Promise<CrudTransaction | null>;
};

function pullMarker(op: UploadOperation): boolean {
  if (!op.metadata) return false;
  try { return Boolean(JSON.parse(op.metadata).firestorePull); }
  catch { return false; }
}

async function rowForOperation(
  db: FirestoreLocalDatabase,
  userId: string,
  op: UploadOperation,
): Promise<BackupRow | null> {
  const table = op.table as FinanceTable;
  const [row] = await db.getAll<BackupRow>(
    `SELECT ${BACKUP_COLUMNS[table].join(', ')} FROM ${table} WHERE id = ? AND user_id = ?`,
    [op.id, userId],
  );
  if (!row) return null;
  return coerceSyncRecord(table, row) as BackupRow;
}

async function uploadPending(
  db: FirestoreLocalDatabase,
  cloud: FirestoreCloudAdapter,
  userId: string,
  instanceId: string,
): Promise<{ uploaded: number; conflicts: number }> {
  let uploaded = 0;
  let conflicts = 0;
  for (;;) {
    const batch = await db.getNextCrudTransaction();
    if (!batch) return { uploaded, conflicts };
    // Every explicit SQLite transaction has its own PowerSync transaction id.
    // Pull replacements deliberately carry a marker on at least one operation;
    // clearing that marker before commit can produce unmarked operations in the
    // same transaction, so the whole transaction is still server-originated.
    if (batch.crud.some(pullMarker)) {
      await batch.complete();
      continue;
    }
    const operations: FirestoreUpload[] = [];
    for (const op of batch.crud) {
      if (!(FINANCE_TABLES as readonly string[]).includes(op.table)) {
        throw new Error(`Unsupported Firestore upload table: ${op.table}`);
      }
      const metadata = op.metadata ? JSON.parse(op.metadata) : {};
      const row = op.op === 'DELETE' ? null : await rowForOperation(db, userId, op);
      operations.push({
        opId: String(op.clientId),
        table: op.table as FinanceTable,
        id: op.id,
        kind: row ? 'set' : 'delete',
        row: row ?? undefined,
        previousUpdatedAt: typeof op.previousValues?.updated_at === 'string' ? op.previousValues.updated_at : undefined,
        keepExisting: metadata.merge === 'keep_existing',
      });
    }
    const results = await cloud.apply(operations);
    if (results.length !== operations.length || results.some((result, index) => result.opId !== operations[index].opId)) {
      throw new Error('Incomplete Firestore acknowledgement. Local changes were retained.');
    }
    for (let index = 0; index < results.length; index++) {
      const result = results[index];
      if (!result.conflict) continue;
      conflicts++;
      await db.execute(
        'INSERT OR REPLACE INTO f1_conflicts (id, payload) VALUES (?, ?)',
        [`${instanceId}:${result.opId}`, JSON.stringify({ ...result, operation: operations[index] })],
      );
    }
    await batch.complete();
    uploaded += operations.length;
  }
}

async function replaceLocalSnapshot(
  db: FirestoreLocalDatabase,
  userId: string,
  rows: Record<FinanceTable, BackupRow[]>,
  markerId: string,
): Promise<number> {
  const marker = JSON.stringify({ firestorePull: markerId });
  let count = 0;
  await db.writeTransaction(async tx => {
    // A user write can arrive while Firestore is being read. Inspect the queue
    // under the same SQLite write lock as the merge and leave those rows alone;
    // they will be uploaded immediately after this transaction commits.
    const pending = new Set<string>();
    for (const entry of await tx.getAll<{ data: string }>('SELECT data FROM ps_crud')) {
      const operation = JSON.parse(entry.data) as { type?: string; id?: string };
      if (operation.type && operation.id) pending.add(`${operation.type}:${operation.id}`);
    }
    for (const table of FINANCE_TABLES) {
      const remoteIds = new Set(rows[table].map(row => row.id));
      const localRows = await tx.getAll<{ id: string }>(`SELECT id FROM ${table} WHERE user_id = ?`, [userId]);
      for (const local of localRows) {
        if (pending.has(`${table}:${local.id}`) || remoteIds.has(local.id)) continue;
        await tx.execute(`UPDATE ${table} SET _metadata = ? WHERE id = ? AND user_id = ?`, [marker, local.id, userId]);
        await tx.execute(`DELETE FROM ${table} WHERE id = ? AND user_id = ?`, [local.id, userId]);
      }
      for (const row of rows[table]) {
        if (pending.has(`${table}:${row.id}`)) continue;
        const columns = BACKUP_COLUMNS[table];
        await tx.execute(
          `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}, _metadata) VALUES (${[...columns, '_metadata'].map(() => '?').join(', ')})`,
          [...columns.map(column => row[column]), marker],
        );
        count++;
      }
      // Future user edits must not inherit the pull marker. This write remains
      // part of the same explicit transaction and is acknowledged with it.
      await tx.execute(`UPDATE ${table} SET _metadata = NULL WHERE user_id = ? AND _metadata = ?`, [userId, marker]);
    }
  });
  return count;
}

/**
 * Pushes durable local CRUD first, then replaces the local account snapshot
 * with an owner-scoped Firestore read. Pull-generated CRUD is tagged and
 * acknowledged locally, so it can never be uploaded as a user edit.
 */
export async function syncFirestoreAccount(
  database: FirestoreLocalDatabase,
  cloud: FirestoreCloudAdapter,
  userId: string,
  instanceId: string,
  projectUrl: string,
): Promise<FirestoreSyncResult> {
  const pushed = await uploadPending(database, cloud, userId, instanceId);
  const entries = await Promise.all(FINANCE_TABLES.map(async table => [table, await cloud.readAll(table)] as const));
  const tables = Object.fromEntries(entries) as Record<FinanceTable, BackupRow[]>;
  validateBackup({
    format: 'f1nancer-backup', version: 1, accountId: userId,
    project: new URL(projectUrl).origin, exportedAt: new Date().toISOString(),
    sync: { hasSynced: true, pendingUploads: 0 }, tables,
  }, userId, projectUrl);
  const downloaded = await replaceLocalSnapshot(database, userId, tables, `${instanceId}:${Date.now()}`);
  await uploadPending(database, cloud, userId, instanceId);
  return { ...pushed, downloaded, syncedAt: new Date().toISOString() };
}

export function firestoreSyncError(error: unknown): Error {
  return new Error(formatSyncError(error));
}
