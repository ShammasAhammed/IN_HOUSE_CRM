// Monthly client reports (Stage 11.4): numbers from the data, words from the AI (a fake model here) or a person,
// strategists and the owner write, a final report is frozen; usable with the AI off.
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { AiModel, AiRequest } from "@/repositories";
import { createAiService } from "@/services/ai";
import { createReportService } from "@/services/reports";
import { createResultService } from "@/services/results";
import { actorOf, addClient, addPerson, addProjectWithTask, eventsFor, fixedClock, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const clock = fixedClock("2026-10-18");
const asked: AiRequest[] = [];
const model = (connected: boolean): AiModel => ({
  connected,
  provider: "fake",
  model: "fake-1",
  answer: async (r) => (asked.push(r), { kind: "answer", outcome: "answered", text: "SUMMARY: A good September.\nWENT WELL:\n- 120 leads\nNEXT:\n- Open day push", toolCalls: [], usage: [{ model: "fake-1", inputTokens: 900, outputTokens: 200, cacheWriteTokens: 0, cacheReadTokens: 0, costMicroUsd: 10_000 }] }),
});
const ads = { forClient: async () => ({ ok: true as const, value: { state: "not_connected" as const } }) };
const make = (connected = true) => createReportService({ store, clock, ai: createAiService({ store, clock, model: model(connected), inrPerUsd: 85 }), ads });
const reports = make();
const results = createResultService({ store, clock, ads });
let owner = "";
let strategist = "";
let accountant = "";
let designer = "";
let zenith = "";
const s = () => actorOf(strategist, ["strategist"]);
const key = { month: "2026-09" };

beforeEach(async () => {
  await wipe(db);
  asked.length = 0;
  owner = await addPerson(db, "Faisal Rahman", ["owner"]);
  strategist = await addPerson(db, "Anjali Nair", ["strategist"]);
  accountant = await addPerson(db, "Lekha Menon", ["accountant"]);
  designer = await addPerson(db, "Nikhil Das", ["designer"]);
  zenith = await addClient(db, "Zenith IAS Academy", { members: [designer] });
  await results.save(s(), { clientId: zenith, month: "2026-09", leads: "120", spend: "45000", admissions: "6", targetLeads: "200" });
  const { taskId } = await addProjectWithTask(db, zenith, { ownerId: designer, status: "done", loggedMinutes: 300, workDate: "2026-09-10" });
  await db.execute(sql`update tasks set title = 'Open day post', completed_at = '2026-09-15T06:00:00Z' where id = ${taskId}`);
  // Done in October: not September's.
  const late = await addProjectWithTask(db, zenith, { ownerId: designer, status: "done" });
  await db.execute(sql`update tasks set completed_at = '2026-10-02T06:00:00Z' where id = ${late.taskId}`);
});

afterAll(async () => {
  await store.close();
  await client.end();
});

const version = async () => {
  const p = await reports.page(s(), zenith, "2026-09");
  return String(p.ok ? p.value.report?.version : 0);
};

describe("monthly client reports", () => {
  it("take their numbers from the data and the AI's words around them", async () => {
    expect((await reports.create(s(), { clientId: zenith, ...key })).ok).toBe(true);
    const p = await reports.page(s(), zenith); // last month by default
    expect(p.ok && p.value.month).toBe("2026-09-01");
    const r = p.ok ? p.value.report! : null;
    expect(r?.facts).toMatchObject({ results: { leads: 120, spendPaise: 4_500_000, costPerLeadPaise: 37_500 }, tasksDone: { count: 1, titles: ["Open day post"] }, internal: { minutesLogged: 300 } });
    expect(r).toMatchObject({ status: "draft", summary: "", createdByName: "Anjali Nair" });

    expect((await reports.writeWithAi(s(), { clientId: zenith, ...key, version: await version() })).ok).toBe(true);
    // The AI saw the client-facing numbers only.
    expect(asked[0]!.turns[0]!.text).toContain("Leads: 120 (target 200)");
    expect(asked[0]!.turns[0]!.text).not.toContain("300");
    const after = await reports.page(s(), zenith, "2026-09");
    expect(after.ok && after.value.report).toMatchObject({ summary: "A good September.", wentWell: "- 120 leads", nextSteps: "- Open day push" });
    const [usage] = await db.execute<{ feature: string }>(sql`select feature from ai_usage`);
    expect(usage?.feature).toBe("client_report");
  });

  it("work with the AI off: numbers with empty boxes a person fills in", async () => {
    const off = make(false);
    const p = await off.page(s(), zenith, "2026-09");
    expect(p.ok && p.value.aiBlocked).toMatch(/.+/);
    await off.create(s(), { clientId: zenith, ...key });
    expect((await off.writeWithAi(s(), { clientId: zenith, ...key, version: await version() })).ok).toBe(false);
    expect((await off.save(s(), { clientId: zenith, ...key, version: await version(), summary: "Written by hand.", wentWell: "- Leads up" })).ok).toBe(true);
    const r = await off.page(s(), zenith, "2026-09");
    expect(r.ok && r.value.report).toMatchObject({ summary: "Written by hand.", wentWell: "- Leads up", nextSteps: "" });
  });

  it("are written by strategists and the owner, read by the accountant, not by designers", async () => {
    const a = actorOf(accountant, ["accountant"]);
    const no = await reports.create(a, { clientId: zenith, ...key });
    expect(no.ok ? "ok" : no.error.code).toBe("forbidden");
    await reports.create(actorOf(owner, ["owner"]), { clientId: zenith, ...key });
    const read = await reports.page(a, zenith, "2026-09");
    expect(read.ok && read.value).toMatchObject({ canEdit: false, aiBlocked: null });
    const d = await reports.page(actorOf(designer, ["designer"]), zenith, "2026-09");
    expect(d.ok ? "ok" : d.error.code).toBe("forbidden");
    const future = await reports.create(s(), { clientId: zenith, month: "2026-11" });
    expect(future.ok).toBe(false);
  });

  it("refuse stale saves, need a summary to be final, and freeze once final", async () => {
    await reports.create(s(), { clientId: zenith, ...key });
    const v1 = await version();
    expect((await reports.save(s(), { clientId: zenith, ...key, version: v1, summary: "" })).ok).toBe(true);
    const noSummary = await reports.finalize(s(), { clientId: zenith, ...key, version: v1 });
    expect(noSummary.ok ? null : noSummary.error.fieldErrors?.summary).toEqual(["Write a short summary first."]);
    expect((await reports.save(s(), { clientId: zenith, ...key, version: v1, summary: "September went well." })).ok).toBe(true);
    const stale = await reports.save(s(), { clientId: zenith, ...key, version: v1, summary: "Other words" });
    expect(stale.ok ? "ok" : stale.error.code).toBe("conflict");
    const v2 = await version();
    expect((await reports.finalize(s(), { clientId: zenith, ...key, version: v2 })).ok).toBe(true);
    const v3 = await version();
    // Final: no more words, numbers or AI.
    for (const r of [
      await reports.save(s(), { clientId: zenith, ...key, version: v3, summary: "Changed" }),
      await reports.refreshNumbers(s(), { clientId: zenith, ...key, version: v3 }),
      await reports.writeWithAi(s(), { clientId: zenith, ...key, version: v3 }),
    ])
      expect(r.ok ? "ok" : r.error.code).toBe("conflict");
    expect(asked).toHaveLength(0);
    const p = await reports.page(s(), zenith, "2026-09");
    expect(p.ok && p.value.report).toMatchObject({ status: "final", summary: "September went well.", finalizedByName: "Anjali Nair" });
    const id = p.ok ? p.value.report!.id : "";
    expect((await eventsFor(db, id)).map((e) => e.action)).toEqual(["client.report_created", "client.report_saved", "client.report_finalized"]);
  });

  it("refresh a draft's numbers when results come in late", async () => {
    await reports.create(s(), { clientId: zenith, ...key });
    await results.save(s(), { clientId: zenith, month: "2026-09", leads: "130", spend: "45000", admissions: "7", targetLeads: "200" });
    expect((await reports.refreshNumbers(s(), { clientId: zenith, ...key, version: await version() })).ok).toBe(true);
    const p = await reports.page(s(), zenith, "2026-09");
    expect(p.ok && p.value.report?.facts.results).toMatchObject({ leads: 130, admissions: 7 });
  });
});
