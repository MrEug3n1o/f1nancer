import { PowerSyncDatabase } from "@powersync/web";
import { openOwnedDatabase, createSerialQueue } from "@f1nancer/domain";
import { AppSchema } from "./schema";
import { supabaseUrl } from "./config";
let active: PowerSyncDatabase | null = null;
export const serializeSync = createSerialQueue();
export function getPowerSync(): PowerSyncDatabase {
  if (!active) throw new Error("Sign in to open your local database.");
  return active;
}
export async function openAccountDatabase(userId: string) {
  if (active) { await active.disconnect(); await active.close(); active = null; }
  const result = await openOwnedDatabase(userId, supabaseUrl, filename => new PowerSyncDatabase({
    schema: AppSchema, database: { dbFilename: filename }, flags: { enableMultiTabs: false },
  }), { getItem: async key => localStorage.getItem(key), setItem: async (key, value) => localStorage.setItem(key, value) }, () => crypto.randomUUID());
  active = result.db;
  return result;
}
export async function disconnectDatabase() { if (active) await active.disconnect(); }
export const powerSync = new Proxy({} as PowerSyncDatabase, {
  get(_target, prop) { const db = getPowerSync(); const v = Reflect.get(db, prop, db); return typeof v === "function" ? v.bind(db) : v; },
});
