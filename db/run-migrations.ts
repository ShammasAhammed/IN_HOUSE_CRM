import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "node:path";

const MIGRATIONS = path.join(process.cwd(), "db", "migrations");

function assertLocal(url: string) {
  const host = new URL(url).hostname;
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "db"].includes(host)) {
    throw new Error(`Refusing to reset a non-local database (${host}).`);
  }
}

/** Apply every numbered migration in db/migrations, in order. `reset` wipes a LOCAL database first. */
export async function runMigrations(url: string, opts: { reset?: boolean } = {}) {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    if (opts.reset) {
      assertLocal(url);
      await sql.unsafe("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
    }
    await migrate(drizzle(sql), { migrationsFolder: MIGRATIONS });
  } finally {
    await sql.end();
  }
}
