import { FINANCE_TABLES } from './financeTables';
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
  legacyProjects: string[] = [],
): Promise<{ db: T; instanceId: string }> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(userId)) throw new Error('Invalid account ID');
  const namespace = new URL(project).hostname.replace(/[^a-z0-9.-]/gi, '_');
  const legacyNamespaces = legacyProjects.map(value => new URL(value).hostname.replace(/[^a-z0-9.-]/gi, '_'));
  const allowedNamespaces = new Set([namespace, ...legacyNamespaces]);
  const key = `f1nancer.database.${namespace}.${userId}`;
  let filename = await storage.getItem(key);
  let db: T | undefined;
  if (!filename) {
    const candidates: string[] = [];
    for (const legacyNamespace of legacyNamespaces) {
      const mapped = await storage.getItem(`f1nancer.database.${legacyNamespace}.${userId}`);
      if (mapped && !candidates.includes(mapped)) candidates.push(mapped);
    }
    if (!candidates.includes('f1nancer.sqlite')) candidates.push('f1nancer.sqlite');
    for (const candidateFilename of candidates) {
      const candidate = factory(candidateFilename);
      await candidate.waitForReady();
      await initializeSyncStorage(candidate, uuid);
      const owners = new Set<string>();
      for (const table of FINANCE_TABLES) {
        for (const row of await candidate.getAll<{ user_id: string }>(`SELECT DISTINCT user_id FROM ${table}`)) owners.add(row.user_id);
      }
      for (const row of await candidate.getAll<{ id: string }>('SELECT id FROM profiles')) owners.add(row.id);
      const [claim] = await candidate.getAll<{ value: string }>("SELECT value FROM f1_sync_meta WHERE key = 'owner'");
      const [projectClaim] = await candidate.getAll<{ value: string }>("SELECT value FROM f1_sync_meta WHERE key = 'project'");
      if (claim) owners.add(claim.value);
      if ([...owners].every(id => id === userId) && (!projectClaim || allowedNamespaces.has(projectClaim.value))) {
        db = candidate; filename = candidateFilename; break;
      }
      await candidate.close();
    }
    if (!db) filename = `f1nancer-${namespace}-${userId}.sqlite`;
    if (!filename) throw new Error('Could not select a local account database.');
    await storage.setItem(key, filename);
  }
  if (!filename) throw new Error('Could not select a local account database.');
  db ??= factory(filename);
  await db.waitForReady();
  const instanceId = await initializeSyncStorage(db, uuid);
  await recordOwner(db, userId);
  await db.execute("INSERT INTO f1_sync_meta (key, value) VALUES ('project', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [namespace]);
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
