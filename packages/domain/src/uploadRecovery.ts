import { BACKUP_COLUMNS, FINANCE_TABLES, validateBackup, projectIdentity, type BackupRow, type FinanceTable, type FinanceBackup } from './backup';
import { coerceSyncRecord } from './syncCoerce';
import type { SyncDatabase, SqlReader } from './syncStorage';

export interface UploadIssue { op_id: string; original: string; error: string; current: BackupRow | null }
export async function readUploadIssues(db: SqlReader, userId: string): Promise<UploadIssue[]> {
  const issues = await db.getAll<Omit<UploadIssue, 'current'>>('SELECT op_id, original, error FROM f1_upload_failures ORDER BY CAST(op_id AS INTEGER)');
  return Promise.all(issues.map(async issue => {
    const op = JSON.parse(issue.original);
    if (!FINANCE_TABLES.includes(op.table)) return { ...issue, current: null };
    const [current] = await db.getAll<BackupRow>(`SELECT ${BACKUP_COLUMNS[op.table as FinanceTable].join(',')} FROM ${op.table} WHERE id=? AND user_id=?`, [op.id, userId]);
    return { ...issue, current: op.op === 'DELETE' ? null : current ?? null };
  }));
}

/** Replace only an explicitly reviewed rejected operation. Keep its original values in a local audit record. */
export async function repairUpload(db: SyncDatabase, issue: UploadIssue, userId: string, project: string): Promise<void> {
  if (!issue.current) throw new Error('This operation needs its linked records restored or corrected before it can upload.');
  await db.writeTransaction(async tx => {
    const [pending] = await tx.getAll<{ original: string }>('SELECT original FROM f1_upload_failures WHERE op_id=?', [issue.op_id]);
    if (!pending || pending.original !== issue.original) throw new Error('This upload has changed. Review it again.');
    const op = JSON.parse(pending.original);
    const tables = {} as FinanceBackup['tables'];
    for (const table of FINANCE_TABLES) tables[table] = await tx.getAll<BackupRow>(`SELECT ${BACKUP_COLUMNS[table].join(',')} FROM ${table} WHERE user_id=? ORDER BY id`, [userId]);
    validateBackup({ format: 'f1nancer-backup', version: 1, accountId: userId, project: projectIdentity(project), exportedAt: new Date().toISOString(), sync: {hasSynced: false, pendingUploads: 1}, tables }, userId, project);
    const current = tables[op.table as FinanceTable]?.find(row => row.id === op.id);
    if (op.op === 'DELETE' || !current || JSON.stringify(current) !== JSON.stringify(issue.current)) throw new Error('The local record changed. Review its current values again.');
    const corrected = { ...op, op: 'PUT', data: coerceSyncRecord(op.table, current), merge: false };
    await tx.execute('INSERT INTO f1_upload_repairs (op_id, original, payload) VALUES (?,?,?) ON CONFLICT(op_id) DO UPDATE SET payload=excluded.payload', [issue.op_id, issue.original, JSON.stringify(corrected)]);
  });
}
