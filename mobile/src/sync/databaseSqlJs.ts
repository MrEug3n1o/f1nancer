import { SQLJSOpenFactory } from "@powersync/adapter-sql-js";
import { JsPowerSyncDatabase } from "./JsPowerSyncDatabase";
import { AppSchema } from "./schema";

const DB_FILENAME = "f1nancer.sqlite";

/** Expo Go only — in-memory sql.js (no file persister; export would kill sync). */
export function createSqlJsPowerSync(): JsPowerSyncDatabase {
  return new JsPowerSyncDatabase({
    schema: AppSchema,
    factory: new SQLJSOpenFactory({
      dbFilename: DB_FILENAME,
    }),
  } as ConstructorParameters<typeof JsPowerSyncDatabase>[0]);
}
