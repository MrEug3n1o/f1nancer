import { BACKUP_COLUMNS, FINANCE_TABLES, validateBackup, type BackupRow, type FinanceBackup, type LocalExportPayload } from '@f1nancer/domain';
import { supabaseUrl } from '../sync/config';
export async function fetchLocalExport(): Promise<LocalExportPayload | null> {
  try { const res = await fetch('/api/local-export'); return res.ok ? await res.json() : null; } catch { return null; }
}
async function stableId(userId: string, table: string, id: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`f1nancer-legacy-v1:${userId}:${table}:${id}`)));
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes.slice(0, 16)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
/** Raw conversion preserves statuses and links without invoking create-time business actions. */
export async function prepareLegacyBackup(userId: string): Promise<FinanceBackup> {
  const payload = await fetchLocalExport();
  if (!payload) throw new Error('No previous desktop database found.');
  const tables = {} as FinanceBackup['tables'];
  const epoch = '1970-01-01T00:00:00.000Z';
  for (const table of FINANCE_TABLES) {
    const raw = table === 'settings' ? payload.settings ? [payload.settings] : [] : payload[table];
    tables[table] = [];
    for (const original of raw ?? []) {
      const item = original as Record<string, unknown>;
      const row: Record<string, unknown> = { ...item, user_id: userId,
        id: await stableId(userId, table, String(table === 'settings' ? 'singleton' : table === 'currencies' ? item.code : item.id)),
        created_at: item.created_at || epoch, updated_at: item.updated_at || item.created_at || epoch };
      for (const [field, target] of Object.entries({ category_id: 'categories', goal_id: 'goals', credit_debt_id: 'credit_debts', recurring_id: 'recurring_rules' })) {
        if (field in item) row[field] = item[field] == null ? null : await stableId(userId, target, String(item[field]));
      }
      if (table === 'settings') {
        row.stats_charts ??= ['trends','spend_by_category','by_currency'];
        for (const col of ['dashboard_widgets','stats_charts','dashboard_widget_views','dashboard_widget_layout']) if (typeof row[col] !== 'string') row[col] = JSON.stringify(row[col]);
      }
      if (table === 'recurring_rules') row.active = item.active ? 1 : 0;
      if (['deposits','transactions','recurring_rules'].includes(table)) row.money_location ??= 'card';
      tables[table].push(Object.fromEntries(BACKUP_COLUMNS[table].map(col => [col, row[col] ?? null])) as BackupRow);
    }
  }
  return validateBackup({ format: 'f1nancer-backup', version: 1, accountId: userId, project: new URL(supabaseUrl).origin,
    exportedAt: new Date().toISOString(), sync: { hasSynced: false, pendingUploads: 0 }, tables }, userId, supabaseUrl);
}
