import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";

import * as schema from "@/db/schema";

/**
 * Integration tests need a real Postgres, not a mock — the behavior under
 * test is SQL correctness (uniqueness constraints, cascades, transactions),
 * which a mocked query builder cannot exercise. Point TEST_DATABASE_URL at a
 * disposable database (see README: `docker run postgres:16-alpine` + the
 * migration script) to run these; otherwise they skip cleanly in CI-less
 * environments rather than failing on a missing connection.
 */
export function testDb() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return null;
  const client = postgres(url, { max: 5 });
  return drizzle(client, { schema });
}

export async function truncateAll(database: NonNullable<ReturnType<typeof testDb>>) {
  await database.execute(
    sql`TRUNCATE TABLE approvals, actions, policies, agents, invites, org_members, organizations RESTART IDENTITY CASCADE`,
  );
}
