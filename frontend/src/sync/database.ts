import { PowerSyncDatabase } from "@powersync/web";
import { AppSchema } from "./schema";

let _powerSync: PowerSyncDatabase | null = null;
let _initError: Error | null = null;

export function getPowerSyncInitError(): Error | null {
  return _initError;
}

export function getPowerSync(): PowerSyncDatabase {
  if (_initError) throw _initError;
  if (_powerSync) return _powerSync;
  try {
    _powerSync = new PowerSyncDatabase({
      schema: AppSchema,
      database: {
        dbFilename: "f1nancer.sqlite",
      },
      flags: {
        enableMultiTabs: false,
      },
    });
    return _powerSync;
  } catch (err) {
    _initError = err instanceof Error ? err : new Error(String(err));
    throw _initError;
  }
}

/** Lazy singleton — do not construct at module import time (WASM / worker crash). */
export const powerSync = new Proxy({} as PowerSyncDatabase, {
  get(_target, prop, receiver) {
    const db = getPowerSync();
    const value = Reflect.get(db, prop, receiver);
    return typeof value === "function" ? value.bind(db) : value;
  },
});
