import { config } from "dotenv";
import { runMigrations } from "../../db/run-migrations";

/** Once per run: wipe the test database and apply every migration. */
export default async function setup() {
  config({ path: ".env.local", quiet: true });
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST is not set (see .env.example). Integration tests need PostgreSQL: npm run db:up");
  await runMigrations(url, { reset: true });
}
