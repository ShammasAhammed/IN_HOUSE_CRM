import { drizzle, type PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import type { PgDatabase } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "@/db/schema";

export type Schema = typeof schema;
/** A database handle or a transaction — repositories accept either. */
export type Db = PgDatabase<PostgresJsQueryResultHKT, Schema>;

// Connection pools are kept on globalThis so development hot reloads reuse them instead of opening new ones.
// Only pools are cached: repositories and services are rebuilt from fresh code on every reload.
const pools = ((globalThis as unknown as { oppplloOnePools?: Map<string, ReturnType<typeof connect>> }).oppplloOnePools ??= new Map());

export function sharedConnection(url: string): ReturnType<typeof connect> {
  let pool = pools.get(url);
  if (!pool) {
    pool = connect(url);
    pools.set(url, pool);
  }
  return pool;
}

export function connect(url: string, opts: { max?: number } = {}) {
  const client = postgres(url, {
    max: opts.max ?? 10,
    idle_timeout: 20,
    onnotice: () => {},
  });
  // Drizzle keeps DATE columns as "YYYY-MM-DD" strings (calendar days), never JS Dates.
  return { client, db: drizzle(client, { schema }) as Db };
}
