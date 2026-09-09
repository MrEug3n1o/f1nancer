import type { AbstractPowerSyncDatabase } from "@powersync/common";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";
import { openOwnedDatabase, createSerialQueue } from "@f1nancer/domain";
import { supabaseUrl } from "./config";
let active: AbstractPowerSyncDatabase | null = null;
export const serializeSync = createSerialQueue();
export const isTemporaryStorage = Constants.executionEnvironment === "storeClient";
export function getPowerSync(): AbstractPowerSyncDatabase {
  if (!active) throw new Error("Sign in to open your local database.");
  return active;
}
export async function openAccountDatabase(userId: string) {
  if (active) { await active.disconnect(); await active.close(); active = null; }
  const factory = isTemporaryStorage
    ? (require("./databaseSqlJs") as typeof import("./databaseSqlJs")).createSqlJsPowerSync
    : (require("./databaseNative") as typeof import("./databaseNative")).createNativePowerSync;
  const result = await openOwnedDatabase(userId, supabaseUrl, factory, AsyncStorage, randomUUID);
  active = result.db;
  return result;
}
export async function disconnectDatabase() { if (active) await active.disconnect(); }
export const powerSync = new Proxy({} as AbstractPowerSyncDatabase, {
  get(_target, prop) { const db = getPowerSync(); const v = Reflect.get(db, prop, db); return typeof v === "function" ? v.bind(db) : v; },
});
