import type { AbstractPowerSyncDatabase } from "@powersync/common";
import Constants from "expo-constants";
import { formatSyncError } from "@f1nancer/domain";

let _powerSync: AbstractPowerSyncDatabase | null = null;
let _initError: Error | null = null;

function isExpoGo(): boolean {
  return Constants.executionEnvironment === "storeClient";
}

export function getPowerSyncInitError(): Error | null {
  return _initError;
}

export function getPowerSync(): AbstractPowerSyncDatabase {
  if (_initError) throw _initError;
  if (_powerSync) return _powerSync;
  try {
    if (isExpoGo()) {
      // Dynamic require so Expo Go never loads native PowerSyncDatabase / op-sqlite JSI.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createSqlJsPowerSync } = require("./databaseSqlJs") as typeof import("./databaseSqlJs");
      _powerSync = createSqlJsPowerSync();
    } else {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createNativePowerSync } = require("./databaseNative") as typeof import("./databaseNative");
      _powerSync = createNativePowerSync();
    }
    return _powerSync;
  } catch (err) {
    _initError = err instanceof Error ? err : new Error(formatSyncError(err));
    throw _initError;
  }
}

/** Lazy singleton — sql.js in Expo Go, native SQLite in EAS/production. */
export const powerSync = new Proxy({} as AbstractPowerSyncDatabase, {
  get(_target, prop, receiver) {
    const db = getPowerSync();
    const value = Reflect.get(db, prop, receiver);
    return typeof value === "function" ? value.bind(db) : value;
  },
});
