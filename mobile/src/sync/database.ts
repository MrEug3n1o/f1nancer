import { PowerSyncDatabase } from "@powersync/react-native";
import { AppSchema } from "./schema";

export const powerSync = new PowerSyncDatabase({
  schema: AppSchema,
  database: {
    dbFilename: "f1nancer.sqlite",
  },
});
