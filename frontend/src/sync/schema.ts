import { createAppSchema } from "@f1nancer/domain";
import { column, Schema, Table } from "@powersync/web";

export const AppSchema = createAppSchema({
  column: column as never,
  Table: Table as never,
  Schema: Schema as never,
}) as Schema;

export type Database = (typeof AppSchema)["types"];
