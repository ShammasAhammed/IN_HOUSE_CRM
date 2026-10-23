// npm run db:migrate            apply pending migrations to DATABASE_URL
// npm run db:migrate -- --reset wipe a local database and migrate from scratch
import { config } from "dotenv";
import { runMigrations } from "./run-migrations";

config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env.local.");
  process.exit(1);
}

const reset = process.argv.includes("--reset");
runMigrations(url, { reset })
  .then(() => console.log(reset ? "Database reset and migrated." : "Migrations applied."))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
