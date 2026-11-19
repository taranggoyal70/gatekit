import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/db/schema";
import type { Database } from "@/lib/services/types";

const MIGRATIONS_FOLDER = path.resolve(__dirname, "../../db/migrations");

/**
 * Integration tests need a real Postgres, not a mock: the behavior under
 * test is SQL correctness (constraints, cascades, transactions, triggers),
 * which a mocked query builder cannot exercise.
 *
 * - With TEST_DATABASE_URL set, tests run against that server (CI does this
 *   with a postgres:16 service container; migrate it first).
 * - Without it, each test file gets a fresh in-process PGlite database
 *   (Postgres compiled to WASM) with every migration applied, so the suite
 *   never silently skips on a laptop with no Docker.
 */
export function testDb(): Database {
  const url = process.env.TEST_DATABASE_URL;
  if (url) {
    const client = postgres(url, { max: 5, onnotice: () => {} });
    return drizzlePostgres(client, { schema });
  }
  const database = drizzlePglite(new PGlite(), { schema });
  pending.set(database, migratePglite(database, { migrationsFolder: MIGRATIONS_FOLDER }));
  return database;
}

const pending = new WeakMap<object, Promise<void>>();

/** Resolves once an in-process database has every migration applied. */
export async function ready(database: Database): Promise<void> {
  await pending.get(database);
}

export async function truncateAll(database: Database) {
  await ready(database);
  await database.execute(
    sql`TRUNCATE TABLE audit_events, approvals, actions, policies, agents, invites, subscriptions, notification_settings, org_members, organizations RESTART IDENTITY CASCADE`,
  );
}
