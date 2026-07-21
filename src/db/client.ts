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

export function db() {
  if (_db) return _db;
  _sql = postgres(connectionString(), { max: 10 });
  _db = drizzle(_sql, { schema });
  return _db;
}
