import { PowerSyncDatabase } from "@powersync/react-native";
import { SQLJSOpenFactory, type SQLJSPersister } from "@powersync/adapter-sql-js";
import * as FileSystem from "expo-file-system";
import { AppSchema } from "./schema";

const DB_FILENAME = "f1nancer.sqlite";

function createSqlJsPersister(dbFilename: string): SQLJSPersister {
  const dbPath = `${FileSystem.documentDirectory ?? ""}${dbFilename}`;
  return {
    async readFile() {
      try {
        const info = await FileSystem.getInfoAsync(dbPath);
        if (!info.exists) return null;
        const result = await FileSystem.readAsStringAsync(dbPath, { encoding: "base64" });
        const binary = atob(result);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
      } catch (err) {
        console.error("sql.js read failed", err);
        return null;
      }
    },
    async writeFile(data) {
      const uint8Array = new Uint8Array(data);
      const binary = Array.from(uint8Array, (byte) => String.fromCharCode(byte)).join("");
      await FileSystem.writeAsStringAsync(dbPath, btoa(binary), { encoding: "base64" });
    },
  };
}

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
      factory: new SQLJSOpenFactory({
        dbFilename: DB_FILENAME,
        persister: createSqlJsPersister(DB_FILENAME),
      }),
    });
    return _powerSync;
  } catch (err) {
    _initError = err instanceof Error ? err : new Error(String(err));
    throw _initError;
  }
}

/** Lazy singleton — constructed after login, using sql.js (no native SQLite). */
export const powerSync = new Proxy({} as PowerSyncDatabase, {
  get(_target, prop, receiver) {
    const db = getPowerSync();
    const value = Reflect.get(db, prop, receiver);
    return typeof value === "function" ? value.bind(db) : value;
  },
});
