import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import type * as schema from "@/db/schema";

/**
 * Any Drizzle Postgres database over Gatekit's schema. Production uses the
 * postgres-js driver (`db()`); tests and the eval harness use in-process
 * PGlite. Services depend only on this shape, so both run the same SQL.
 */
export type Database = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;
