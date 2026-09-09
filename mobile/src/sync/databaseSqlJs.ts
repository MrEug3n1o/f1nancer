import { SQLJSOpenFactory } from "@powersync/adapter-sql-js";
import { JsPowerSyncDatabase } from "./JsPowerSyncDatabase";
import { AppSchema } from "./schema";



/** Expo Go only — in-memory sql.js (no file persister; export would kill sync). */
export function createSqlJsPowerSync(filename: string): JsPowerSyncDatabase {
  return new JsPowerSyncDatabase({
    schema: AppSchema,
    factory: new SQLJSOpenFactory({
      dbFilename: filename,
    }),
  } as ConstructorParameters<typeof JsPowerSyncDatabase>[0]);
}
