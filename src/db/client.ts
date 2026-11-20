import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

let _sql: postgres.Sql | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Missing DATABASE_URL");
  return url;
}

/**
 * Connections per server instance. Each serverless instance holds its own
 * pool, so lower this when many instances share one Postgres connection
 * limit; a pooled connection string (PgBouncer, Neon's -pooler host) helps too.
 */
function poolSize(): number {
  const raw = process.env.DATABASE_POOL_MAX;
  if (!raw) return 10;
  const size = Number(raw);
  if (!Number.isInteger(size) || size < 1) throw new Error("DATABASE_POOL_MAX must be a positive integer.");
  return size;
}

export function db() {
  if (_db) return _db;
  _sql = postgres(connectionString(), { max: poolSize() });
  _db = drizzle(_sql, { schema });
  return _db;
}
