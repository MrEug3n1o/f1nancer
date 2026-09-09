import { FINANCE_TABLES } from './backup';
import { initializeSyncStorage, recordOwner, type SyncDatabase } from './syncStorage';
export interface AccountDatabase extends SyncDatabase {
  waitForReady(): Promise<void>;
  disconnect(): Promise<void>;
  close(): Promise<void>;
}
/** Adopt the old file only if its stored ownership is unambiguous. Never clear it. */
export async function openOwnedDatabase<T extends AccountDatabase>(
  userId: string, project: string, factory: (filename: string) => T,
  storage: { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> },
  uuid: () => string,
): Promise<{ db: T; instanceId: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error('Invalid account ID');
  const namespace = new URL(project).hostname.replace(/[^a-z0-9.-]/gi, '_');
  const key = `f1nancer.database.${namespace}.${userId}`;
  let filename = await storage.getItem(key);
  let db: T | undefined;
  if (!filename) {
    const legacy = factory('f1nancer.sqlite');
    await legacy.waitForReady();
    await initializeSyncStorage(legacy, uuid);
    const owners = new Set<string>();
    for (const t of FINANCE_TABLES) {
      for (const row of await legacy.getAll<{ user_id: string }>(`SELECT DISTINCT user_id FROM ${t}`)) owners.add(row.user_id);
    }
    for (const row of await legacy.getAll<{ id: string }>('SELECT id FROM profiles')) owners.add(row.id);
    const [claim] = await legacy.getAll<{ value: string }>("SELECT value FROM f1_sync_meta WHERE key = 'owner'");
    const [projectClaim] = await legacy.getAll<{ value: string }>("SELECT value FROM f1_sync_meta WHERE key = 'project'");
    if (claim) owners.add(claim.value);
    if ([...owners].every(id => id === userId) && (!projectClaim || projectClaim.value === namespace)) {
      db = legacy; filename = 'f1nancer.sqlite';
    } else {
      await legacy.close();
      filename = `f1nancer-${namespace}-${userId}.sqlite`;
    }
    await storage.setItem(key, filename);
  }
  db ??= factory(filename);
  await db.waitForReady();
  const instanceId = await initializeSyncStorage(db, uuid);
  await recordOwner(db, userId);
  await db.execute("INSERT OR IGNORE INTO f1_sync_meta (key, value) VALUES ('project', ?)", [namespace]);
  return { db, instanceId };
}

/** One queue for auth transitions, preventing a late connect after sign-out. */
export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(operation: () => Promise<T>): Promise<T> => {
    const next = tail.then(operation);
    tail = next.catch(() => undefined);
    return next;
  };
}
