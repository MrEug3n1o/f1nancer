import { BACKUP_COLUMNS, FINANCE_TABLES, type FinanceTable } from './backup';
import type { SyncDatabase } from './syncStorage';
export interface BackupConflict { id: string; payload: string }
export async function resolveBackupConflict(db: SyncDatabase, conflict: BackupConflict, useBackup: boolean, userId: string) {
  const evidence = JSON.parse(conflict.payload);
  const table = evidence.operation.table as FinanceTable;
  if (!FINANCE_TABLES.includes(table) || evidence.cloud.user_id !== userId) throw new Error('Invalid conflict ownership.');
  await db.writeTransaction(async tx => {
    if (useBackup) {
      const row = { ...evidence.cloud, ...evidence.operation.data, id: evidence.id, user_id: userId };
      if (table === "recurring_rules") row.active = row.active ? 1 : 0;
      const cols = BACKUP_COLUMNS[table];
      await tx.execute(`INSERT OR REPLACE INTO ${table} (${cols.join(', ')}, _metadata) VALUES (${[...cols, '_metadata'].map(() => '?').join(', ')})`,
        [...cols.map(k => row[k]), JSON.stringify({ merge: 'replace', restore: row })]);
    }
    await tx.execute('DELETE FROM f1_conflicts WHERE id = ?', [conflict.id]);
  });
}
