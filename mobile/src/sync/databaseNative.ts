import { PowerSyncDatabase } from "@powersync/react-native";
import { AppSchema } from "./schema";

const DB_FILENAME = "f1nancer.sqlite";

/** EAS / production builds — native op-sqlite. */
export function createNativePowerSync(): PowerSyncDatabase {
  return new PowerSyncDatabase({
    schema: AppSchema,
    database: {
      dbFilename: DB_FILENAME,
    },
  });
}
