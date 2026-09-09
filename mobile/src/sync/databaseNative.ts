import { PowerSyncDatabase } from "@powersync/react-native";
import { AppSchema } from "./schema";



/** EAS / production builds — native op-sqlite. */
export function createNativePowerSync(filename: string): PowerSyncDatabase {
  return new PowerSyncDatabase({
    schema: AppSchema,
    database: {
      dbFilename: filename,
    },
  });
}
