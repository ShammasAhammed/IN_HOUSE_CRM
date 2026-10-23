// The daily job: opens each retainer's month and keeps it in step with its terms, and (6.6) generates recurring
// tasks ahead. Called once a day by the host's scheduler (vercel.json) with the shared secret; safe to repeat.
import { timingSafeEqual } from "node:crypto";
import { getServices } from "@/lib/server/container";
import { reportError } from "@/lib/server/report-error";

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const wanted = Buffer.from(`Bearer ${secret}`);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

export async function GET(request: Request) {
  if (!authorised(request)) return Response.json({ error: "Not allowed." }, { status: 401 });
  const services = getServices();
  const out: Record<string, unknown> = {};
  let ok = true;
  // Each part runs even if another fails; failures are reported, not swallowed.
  for (const [name, run] of [
    ["periods", () => services.engagements.runDaily()],
    ["recurringTasks", () => services.recurrences.runDaily()],
    ["crmWonLeads", () => services.crm.sync()],
    // Until the switch (Stage 10a), the CRM's leads are mirrored here every day.
    ["crmLeadsCopy", () => services.crm.copyLeads()],
    ["automations", () => services.automations.runDaily()],
    ["growthScores", async () => ({ ...(await services.growth.snapshotScores()), errors: [] as string[] })],
    ["dailySummary", () => services.dailySummary.runDaily()],
    // Space access (Stage 14.2): ends on its day; owner and HR hear a week before; 90-day reviews come due.
    ["spaceAccess", () => services.spaceAccess.runDaily()],
    ["promiseReminders", () => services.myAssistant.runReminders()],
    ["coworker", () => services.coworker.runDaily()],
    ["clientFiles", () => services.clientLinks.runDaily()],
    // Weekly and monthly meetings get their next page with the open action items (Stage 13.4).
    ["meetings", () => services.meetings.runDaily()],
    // Every table to the owner's own storage, read back and checked (Stage 11.7); skipped until storage is chosen.
    ["backup", () => services.backups.runDaily()],
    // Last, so today's automations go out in today's email.
    ["emailDigest", () => services.notifications.emailDigest()],
  ] as const) {
    try {
      const { errors, ...counts } = await run();
      for (const err of errors) reportError(err, { where: `jobs.daily.${name}` });
      out[name] = { ...counts, failed: errors.length };
      ok &&= errors.length === 0;
    } catch (err) {
      reportError(err, { where: `jobs.daily.${name}` });
      out[name] = { failed: true };
      ok = false;
    }
  }
  return Response.json({ ok, ...out }, { status: ok ? 200 : 500 });
}
