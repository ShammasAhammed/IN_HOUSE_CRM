// First run on a new database (the hosted one): creates the owner from OWNER_EMAIL / OWNER_NAME so someone can sign
// in. Does nothing once anyone exists. Runs in Vercel's build after the migrations (package.json "vercel-build").
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { istDate } from "@/lib/dates";
import { newId } from "@/lib/id";
import * as s from "./schema";
import { LEAVE_TYPES } from "./seed/hr";

config({ path: ".env.local", quiet: true });

async function main() {
  const url = process.env.DATABASE_URL;
  const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (!url || !email) {
    console.log("Bootstrap skipped (DATABASE_URL or OWNER_EMAIL not set).");
    return;
  }
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const db = drizzle(client);
    await leaveTypes(db);
    const [{ n }] = (await db.execute(sql`select count(*)::int as n from people`)) as unknown as Array<{ n: number }>;
    if (n > 0) {
      console.log("Bootstrap: people already exist; nothing to do.");
      return;
    }
    const id = newId();
    await db.insert(s.people).values({ id, fullName: process.env.OWNER_NAME?.trim() || "Owner", workEmail: email, jobTitle: "Founder", employmentType: "full_time", joinDate: istDate(), capacityMinutesPerWeek: 20 * 60 });
    await db.insert(s.personRoles).values({ personId: id, role: "owner" });
    console.log(`Bootstrap: created the owner ${email}. Sign in with that Google account.`);
  } finally {
    await client.end();
  }
}

/** The usual leave types (casual, sick, comp-off, unpaid), once, when there are none at all (test report H2). */
async function leaveTypes(db: ReturnType<typeof drizzle>) {
  const [{ n }] = (await db.execute(sql`select count(*)::int as n from leave_types`)) as unknown as Array<{ n: number }>;
  if (n > 0) return;
  await db.transaction(async (tx) => {
    for (const [position, t] of LEAVE_TYPES.entries()) {
      const { quotasDays, ...rest } = t;
      const id = newId();
      await tx.insert(s.leaveTypes).values({ id, ...rest, position });
      for (const [employmentType, days] of Object.entries(quotasDays)) await tx.insert(s.leaveQuotas).values({ id: newId(), leaveTypeId: id, employmentType: employmentType as never, halfDaysPerYear: days * 2 });
    }
  });
  console.log(`Bootstrap: added the usual leave types (${LEAVE_TYPES.map((t) => t.name).join(", ")}). HR can change them in Leave → Settings.`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
