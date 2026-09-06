import { PowerSyncDatabase } from "@powersync/web";
import { AppSchema } from "./schema";

export const powerSync = new PowerSyncDatabase({
  schema: AppSchema,
  database: {
    dbFilename: "f1nancer.sqlite",
  },
});
