import type { SqlReader, SyncDatabase } from './syncStorage';

export const FINANCE_TABLES = ['currencies', 'categories', 'settings', 'goals', 'deposits', 'credit_debts', 'recurring_rules', 'budgets', 'transactions'] as const;
export type FinanceTable = typeof FINANCE_TABLES[number];
export type BackupRow = Record<string, string | number | null> & { id: string; user_id: string };
export interface FinanceBackup {
  format: 'f1nancer-backup'; version: 1; accountId: string; project: string; exportedAt: string;
  sync: { hasSynced: boolean; pendingUploads: number };
  tables: Record<FinanceTable, BackupRow[]>;
}
export interface ImportItem { key: string; table: FinanceTable; row: BackupRow; existing?: BackupRow; kind: 'add' | 'same' | 'conflict' }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const firebaseUidPattern = /^[A-Za-z0-9_-]{1,128}$/;
const base = ['id', 'user_id', 'created_at', 'updated_at'];
export const BACKUP_COLUMNS: Record<FinanceTable, string[]> = {
  currencies: [...base, 'code', 'name'], categories: [...base, 'name', 'type', 'color'],
  settings: [...base, 'default_currency_code', 'theme', 'locale', 'dashboard_widgets', 'stats_charts', 'dashboard_widget_views', 'dashboard_widget_layout'],
  goals: [...base, 'name', 'target_amount', 'current_amount', 'currency_code', 'deadline', 'status'],
  deposits: [...base, 'name', 'type', 'principal_cents', 'currency_code', 'start_date', 'end_date', 'annual_rate_bps', 'counterparty', 'note', 'status', 'money_location'],
  credit_debts: [...base, 'name', 'direction', 'source', 'principal_cents', 'currency_code', 'start_date', 'due_date', 'annual_rate_bps', 'counterparty', 'note', 'status'],
  recurring_rules: [...base, 'amount', 'currency_code', 'category_id', 'type', 'cadence', 'billing_day', 'next_run_date', 'note', 'active', 'money_location'],
  budgets: [...base, 'category_id', 'limit_cents', 'currency_code'],
  transactions: [...base, 'amount', 'currency_code', 'date', 'type', 'category_id', 'note', 'recurring_id', 'goal_id', 'credit_debt_id', 'money_location'],
};
const nullable = new Set(['deadline', 'annual_rate_bps', 'counterparty', 'note', 'due_date', 'recurring_id', 'goal_id', 'credit_debt_id']);
const numeric = new Set(['amount', 'target_amount', 'current_amount', 'principal_cents', 'annual_rate_bps', 'billing_day', 'limit_cents', 'active']);
const enums: Record<string, Record<string, string[]>> = {
  categories: { type: ['income', 'expense'] }, transactions: { type: ['income', 'expense'], money_location: ['card', 'cash'] },
  goals: { status: ['active', 'completed', 'cancelled'] },
  deposits: { type: ['bank', 'rental'], status: ['active', 'matured', 'returned', 'cancelled'], money_location: ['card', 'cash'] },
  credit_debts: { direction: ['credit', 'debt'], source: ['bank', 'informal'], status: ['active', 'paid', 'cancelled'] },
  recurring_rules: { type: ['income', 'expense'], cadence: ['weekly', 'monthly', 'yearly'], money_location: ['card', 'cash'] },
};
export function projectIdentity(url: string): string { return new URL(url).origin; }

export function validateBackup(raw: unknown, accountId: string, project: string): FinanceBackup {
  const b = raw as FinanceBackup;
  if (!b || b.format !== 'f1nancer-backup' || b.version !== 1) throw new Error('Unsupported backup format or version.');
  if (b.accountId !== accountId || b.project !== projectIdentity(project)) throw new Error('This backup belongs to a different account or cloud project.');
  if (!firebaseUidPattern.test(accountId) || !b.tables || !b.sync || typeof b.sync.hasSynced !== 'boolean' || !Number.isSafeInteger(b.sync.pendingUploads) || b.sync.pendingUploads < 0 || !Number.isFinite(Date.parse(b.exportedAt))) throw new Error('Invalid backup metadata.');
  for (const table of FINANCE_TABLES) {
    const rows = b.tables[table];
    if (!Array.isArray(rows)) throw new Error(`Missing backup table: ${table}`);
    const ids = new Set<string>(); const keys = new Set<string>();
    for (const row of rows) {
      if (!row || typeof row !== 'object' || row.user_id !== accountId || !uuidPattern.test(row.id)) throw new Error(`Invalid ownership or ID in ${table}.`);
      if (ids.has(row.id)) throw new Error(`Duplicate ID in ${table}.`);
      ids.add(row.id);
      if (Object.keys(row).some(k => !BACKUP_COLUMNS[table].includes(k))) throw new Error(`Unknown column in ${table}.`);
      for (const col of BACKUP_COLUMNS[table]) {
        const v = row[col];
        if (v === null && nullable.has(col)) continue;
        if (numeric.has(col)) {
          if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < -2147483648 || v > 2147483647) throw new Error(`Invalid number: ${table}.${col}`);
        } else if (typeof v !== 'string') throw new Error(`Invalid value: ${table}.${col}`);
        // Account ownership accepts both legacy UUIDs and Firebase UIDs. Record
        // references remain UUIDs because existing finance row IDs are preserved.
        if (col !== 'user_id' && col.endsWith('_id') && v !== null && !uuidPattern.test(String(v))) throw new Error(`Invalid reference: ${table}.${col}`);
        if ((col.endsWith('_date') || col === 'date' || col === 'deadline') && (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0, 10) !== v)) throw new Error(`Invalid date: ${table}.${col}`);
        if (col.endsWith('_at') && !Number.isFinite(Date.parse(String(v)))) throw new Error(`Invalid timestamp: ${table}.${col}`);
        if ((col === 'code' || col.endsWith('currency_code')) && !/^[A-Z]{3}$/.test(String(v))) throw new Error(`Invalid currency in ${table}.`);
        if (['dashboard_widgets', 'stats_charts', 'dashboard_widget_views', 'dashboard_widget_layout'].includes(col)) {
          let parsed; try { parsed = JSON.parse(String(v)); } catch { throw new Error(`Invalid settings JSON: ${col}`); }
          if (!parsed || typeof parsed !== 'object' || (col !== 'dashboard_widget_views' && !Array.isArray(parsed))) throw new Error(`Invalid settings: ${col}`);
        }
      }
      for (const [col, values] of Object.entries(enums[table] ?? {})) if (!values.includes(String(row[col]))) throw new Error(`Invalid ${table}.${col}`);
      if (table === 'recurring_rules' && (![0, 1].includes(Number(row.active)) || Number(row.billing_day) < 1 || Number(row.billing_day) > 31)) throw new Error('Invalid recurring rule.');
      const key = naturalKey(table, row);
      if (keys.has(key)) throw new Error(`Duplicate unique key in ${table}.`);
      keys.add(key);
    }
  }
  for (const table of FINANCE_TABLES) for (const row of b.tables[table]) {
    for (const [col, target] of Object.entries({ category_id: 'categories', goal_id: 'goals', credit_debt_id: 'credit_debts', recurring_id: 'recurring_rules' })) {
      if (row[col] && !b.tables[target as FinanceTable].some(r => r.id === row[col])) throw new Error(`Broken reference: ${table}.${col}`);
    }
  }
  return b;
}
type FirestoreValue = { nullValue?: null; stringValue?: string; integerValue?: string; doubleValue?: number; booleanValue?: boolean };
interface CloudSnapshot {
  format: 'f1nancer-cloud-snapshot'; version: 1; exportedAt: string; account: { uid: string };
  collections: Record<string, { fields: Record<string, FirestoreValue> }[]>;
}
function firestoreValue(value: FirestoreValue): string | number | null {
  if (!value || typeof value !== 'object') throw new Error('Invalid value in cloud snapshot.');
  if ('nullValue' in value) return null;
  if (typeof value.stringValue === 'string') return value.stringValue;
  if (typeof value.integerValue === 'string') return Number(value.integerValue);
  if (typeof value.doubleValue === 'number') return value.doubleValue;
  if (typeof value.booleanValue === 'boolean') return value.booleanValue ? 1 : 0;
  throw new Error('Unsupported value type in cloud snapshot.');
}
// Migrated cloud rows store calendar dates as the UTC instant of local midnight
// (2026-09-05T22:00:00.000Z is 6 Sep in UTC+2); round to the nearest UTC day.
function calendarDate(value: string | number | null): string | number | null {
  if (typeof value !== 'string' || /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms + 12 * 3_600_000).toISOString().slice(0, 10) : value;
}
/** Converts a Firestore REST account snapshot into a backup owned by the signed-in account. */
export function convertCloudSnapshot(raw: unknown, accountId: string, project: string): FinanceBackup {
  const s = raw as CloudSnapshot;
  if (!s || s.format !== 'f1nancer-cloud-snapshot' || s.version !== 1 || !s.collections || typeof s.account?.uid !== 'string') throw new Error('Unsupported cloud snapshot format or version.');
  const tables = {} as FinanceBackup['tables'];
  for (const table of FINANCE_TABLES) {
    const docs = s.collections[table];
    if (!Array.isArray(docs)) throw new Error(`Missing snapshot collection: ${table}`);
    tables[table] = docs.map(doc => {
      const row = Object.fromEntries(BACKUP_COLUMNS[table].map(col => {
        const value = doc?.fields?.[col] === undefined ? null : firestoreValue(doc.fields[col]);
        return [col, col.endsWith('_date') || col === 'date' || col === 'deadline' ? calendarDate(value) : value];
      })) as BackupRow;
      if (row.user_id !== s.account.uid) throw new Error(`Invalid ownership in snapshot ${table}.`);
      return { ...row, user_id: accountId };
    });
  }
  return { format: 'f1nancer-backup', version: 1, accountId, project: projectIdentity(project), exportedAt: s.exportedAt, sync: { hasSynced: true, pendingUploads: 0 }, tables };
}
export function parseBackup(text: string, userId: string, project: string): FinanceBackup {
  if (text.length > 50 * 1024 * 1024) throw new Error('Backup exceeds the 50 MB limit.');
  let raw; try { raw = JSON.parse(text); } catch { throw new Error('The selected file is not valid JSON.'); }
  if ((raw as { format?: unknown })?.format === 'f1nancer-cloud-snapshot') raw = convertCloudSnapshot(raw, userId, project);
  return validateBackup(raw, userId, project);
}
async function snapshot(reader: SqlReader, userId: string): Promise<FinanceBackup['tables']> {
  const result = {} as FinanceBackup['tables'];
  for (const table of FINANCE_TABLES) result[table] = await reader.getAll<BackupRow>(`SELECT ${BACKUP_COLUMNS[table].join(', ')} FROM ${table} WHERE user_id = ? ORDER BY id`, [userId]);
  return result;
}
export async function exportBackup(db: SyncDatabase, accountId: string, project: string, sync: FinanceBackup['sync']): Promise<FinanceBackup> {
  return { format: 'f1nancer-backup', version: 1, accountId, project: projectIdentity(project), exportedAt: new Date().toISOString(), sync, tables: await db.readTransaction(tx => snapshot(tx, accountId)) };
}
function naturalKey(table: FinanceTable, row: BackupRow): string {
  if (table === 'settings') return row.user_id;
  if (table === 'currencies') return String(row.code);
  if (table === 'budgets') return `${row.category_id}:${row.currency_code}`;
  return row.id;
}
export function sameBackupRow(a: BackupRow, b: BackupRow): boolean {
  return Object.keys(a).filter(k => !['id', 'created_at', 'updated_at'].includes(k)).every(k => a[k] === b[k]);
}
export function previewBackup(backup: FinanceBackup, current: FinanceBackup): ImportItem[] {
  return FINANCE_TABLES.flatMap(table => backup.tables[table].map(row => {
    const existing = current.tables[table].find(r => r.id === row.id || naturalKey(table, r) === naturalKey(table, row));
    return { key: `${table}:${row.id}`, table, row: { ...row, id: existing?.id ?? row.id }, existing,
      kind: !existing ? 'add' as const : sameBackupRow(row, existing) ? 'same' as const : 'conflict' as const };
  }));
}
export async function importBackup(db: SyncDatabase, backup: FinanceBackup, current: FinanceBackup, replaceKeys: Set<string>, uuid: () => string): Promise<number> {
  validateBackup(backup, current.accountId, current.project);
  return db.writeTransaction(async tx => {
    const latest = { ...current, tables: await snapshot(tx, current.accountId) };
    // Prevent a preview from silently overwriting edits made while the dialog was open.
    const oldPreview = previewBackup(backup, current);
    const items = previewBackup(backup, latest);
    for (const item of items) {
      const old = oldPreview.find(i => i.key === item.key)!;
      if (JSON.stringify(item.existing) !== JSON.stringify(old.existing)) throw new Error('Data changed while previewing. Reopen the backup to review the latest conflicts.');
    }
    await tx.execute('INSERT INTO f1_recovery (id, payload, created_at) VALUES (?, ?, ?)', [uuid(), JSON.stringify(latest), new Date().toISOString()]);
    let count = 0;
    for (const item of items) {
      if (item.kind === 'same' || (item.kind === 'conflict' && !replaceKeys.has(item.key))) continue;
      const cols = BACKUP_COLUMNS[item.table];
      const metadata = JSON.stringify({ merge: replaceKeys.has(item.key) ? 'replace' : 'keep_existing', restore: item.row });
      await tx.execute(`INSERT OR REPLACE INTO ${item.table} (${cols.join(', ')}, _metadata) VALUES (${[...cols, '_metadata'].map(() => '?').join(', ')})`, [...cols.map(k => item.row[k]), metadata]);
      count++;
    }
    return count;
  });
}
