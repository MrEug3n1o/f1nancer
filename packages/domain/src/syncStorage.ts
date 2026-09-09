/** The small SQL surface shared by the web and native PowerSync adapters. */
export interface SqlReader {
  getAll<T>(sql: string, parameters?: any[]): Promise<T[]>;
}
export interface SqlWriter extends SqlReader {
  execute(sql: string, parameters?: any[]): Promise<any>;
}
export interface SyncDatabase extends SqlWriter {
  writeTransaction<T>(fn: (tx: SqlWriter) => Promise<T>): Promise<T>;
  readTransaction<T>(fn: (tx: SqlReader) => Promise<T>): Promise<T>;
}

export async function initializeSyncStorage(db: SqlWriter, uuid: () => string): Promise<string> {
  await db.execute('CREATE TABLE IF NOT EXISTS f1_sync_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  await db.execute('CREATE TABLE IF NOT EXISTS f1_recovery (id TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at TEXT NOT NULL)');
  await db.execute('CREATE TABLE IF NOT EXISTS f1_upload_failures (op_id TEXT PRIMARY KEY, original TEXT NOT NULL, error TEXT NOT NULL)');
  await db.execute('CREATE TABLE IF NOT EXISTS f1_upload_repairs (op_id TEXT PRIMARY KEY, original TEXT NOT NULL, payload TEXT NOT NULL)');
  await db.execute('CREATE TABLE IF NOT EXISTS f1_conflicts (id TEXT PRIMARY KEY, payload TEXT NOT NULL)');
  await db.execute("INSERT OR IGNORE INTO f1_sync_meta (key, value) VALUES ('instance', ?)", [uuid()]);
  const [row] = await db.getAll<{ value: string }>("SELECT value FROM f1_sync_meta WHERE key = 'instance'");
  return row.value;
}

export async function recordOwner(db: SqlWriter, userId: string): Promise<void> {
  const [owner] = await db.getAll<{ value: string }>("SELECT value FROM f1_sync_meta WHERE key = 'owner'");
  if (owner && owner.value !== userId) throw new Error('This local database belongs to another account. It has been preserved.');
  await db.execute("INSERT OR IGNORE INTO f1_sync_meta (key, value) VALUES ('owner', ?)", [userId]);
}
