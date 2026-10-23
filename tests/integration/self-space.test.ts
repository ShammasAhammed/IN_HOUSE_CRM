// Oppllo as its own client (Stage 14.5): the self space's results live from Sales (typed numbers win, targets carry),
// the "Oppllo – <month>" self-report, never in a portal, never billed; the Oppllo Marketing kit sets it all up once;
// spaces are reached by name in the tools and stay private; oppllo_results.
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { newId } from "@/lib/id";
import type { FileStorage, Mailer } from "@/repositories";
import { createAiService } from "@/services/ai";
import { createAdService } from "@/services/ads";
import { createAssetService } from "@/services/assets";
import { assistantTools, type AssistantDeps } from "@/services/assistant";
import { createCapacityService } from "@/services/capacity";
import { createClientService } from "@/services/clients";
import { createContentService } from "@/services/content";
import { createDashboardService } from "@/services/dashboard";
import { createEngagementService } from "@/services/engagements";
import { createKnowledgeService } from "@/services/knowledge";
import { createLeadService } from "@/services/leads";
import { createLeaveService } from "@/services/leave";
import { createPeopleService } from "@/services/people";
import { createPortalService } from "@/services/portal";
import { createProjectService } from "@/services/projects";
import { createReportService } from "@/services/reports";
import { createResultService } from "@/services/results";
import { createSpaceKitService } from "@/services/space-kits";
import { createTaskService } from "@/services/tasks";
import { createTimeService } from "@/services/time";
import { actorOf, addClient, addPerson, addService, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const clock = { today: () => "2026-10-21", now: () => new Date("2026-10-21T06:30:00Z") };
const ads = { forClient: async () => ({ ok: true as const, value: { state: "not_connected" as const } }) };
const results = createResultService({ store, clock, ads });
const reports = createReportService({ store, clock, ai: createAiService({ store, clock, inrPerUsd: 85 }), ads });
const kits = createSpaceKitService({ store, clock });

const ids = { owner: "", strategist: "", designer: "", self: "", founder: "" };
const named = (id: string, roles: Parameters<typeof actorOf>[1], fullName: string) => ({ ...actorOf(id, roles), fullName });
const owner = () => named(ids.owner, ["owner"], "Faisal Rahman");
const strategist = () => named(ids.strategist, ["strategist"], "Anjali Nair");
const designer = () => named(ids.designer, ["designer"], "Nikhil Das");
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? "ok" : r.error!.code);
function value<T>(r: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

/** A Sales lead made on a day (India time), optionally won or moved to "audit booked" that day. */
async function lead(day: string, opts: { channel?: string; won?: boolean; demo?: boolean } = {}) {
  const id = newId();
  const at = new Date(`${day}T06:00:00Z`);
  await db.insert(s.leads).values({ id, name: "A college", stage: opts.won ? "won" : opts.demo ? "audit_booked" : "new", channel: opts.channel ?? null, createdAt: at, wonAt: opts.won ? at : null });
  if (opts.demo) await db.insert(s.leadActivities).values({ id: newId(), leadId: id, type: "stage", text: "Audit booked", fromStage: "contacted", toStage: "audit_booked", at });
}

beforeEach(async () => {
  await wipe(db);
  ids.owner = await addPerson(db, "Faisal Rahman", ["owner"]);
  ids.strategist = await addPerson(db, "Anjali Nair", ["strategist"]);
  ids.designer = await addPerson(db, "Nikhil Das", ["designer"]);
  ids.self = newId();
  ids.founder = newId();
  await db.insert(s.clients).values([
    { id: ids.self, name: "Oppllo Marketing", isInternal: true, isSelf: true, status: "active" },
    { id: ids.founder, name: "Founder office", isInternal: true, isPrivate: true, status: "active" },
  ]);
  await db.insert(s.clientMembers).values({ clientId: ids.founder, personId: ids.designer, level: "edit" });
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("Oppllo's own results", () => {
  it("live from Sales; typed numbers win; targets carry; other spaces unchanged", async () => {
    await lead("2026-10-02", { channel: "Meta lead form" });
    await lead("2026-10-05", { channel: "Meta lead form", demo: true });
    await lead("2026-10-09", { won: true });
    await lead("2026-09-20", { channel: "Referral" });
    let r = value(await results.forSelf(strategist()));
    expect([r.months[0]!.result?.leads, r.months[0]!.result?.callsBooked, r.months[0]!.result?.admissions]).toEqual([3, 1, 1]);
    expect(r.months[1]!.result?.leads).toBe(1);
    expect(r.self?.byChannel).toEqual([{ channel: "Meta lead form", leads: 2 }, { channel: "Landing page", leads: 1 }]);
    expect(r.health.level).toBe("no_target");
    value(await results.save(strategist(), { clientId: ids.self, month: "2026-10", leads: "10", spend: "", callsBooked: "", admissions: "", targetLeads: "20", targetAdmissions: "2" }));
    r = value(await results.forSelf(strategist()));
    expect([r.months[0]!.result?.leads, r.months[0]!.result?.admissions, r.months[0]!.result?.targetLeads]).toEqual([10, 1, 20]);
    expect(value(await results.form(strategist(), ids.self)).values.callsBooked).toBe(1);
    // An ordinary space shows nothing live.
    const other = value(await results.forClient(owner(), ids.founder));
    expect([other.self, other.months[0]!.result]).toEqual([null, null]);
  });

  it("the self-report: 'Oppllo', live numbers, frozen when final; never in a portal; never billed", async () => {
    await lead("2026-09-03", { won: true });
    const { id } = value(await reports.create(strategist(), { clientId: ids.self, month: "2026-09" }));
    const page = value(await reports.page(strategist(), ids.self, "2026-09"));
    expect([page.self, page.report?.facts.clientName, page.report?.facts.results?.admissions, page.report?.facts.results?.leads]).toEqual([true, "Oppllo", 1, 1]);
    value(await reports.save(owner(), { clientId: ids.self, month: "2026-09", version: page.report!.version, summary: "A good first month of our own marketing.", wentWell: "", nextSteps: "" }));
    const saved = value(await reports.page(owner(), ids.self, "2026-09")).report!;
    value(await reports.finalize(owner(), { clientId: ids.self, month: "2026-09", version: saved.version }));
    expect(value(await reports.page(owner(), ids.self, "2026-09")).report?.status).toBe("final");
    expect(code(await reports.save(owner(), { clientId: ids.self, month: "2026-09", version: saved.version + 1, summary: "x", wentWell: "", nextSteps: "" }))).not.toBe("ok");
    expect(id).toBeTruthy();

    const mailer: Mailer = { send: async () => undefined };
    const portal = createPortalService({ store, clock, storage: {} as FileStorage, mailer, emailReady: false, appUrl: "https://one.example", logLinks: false });
    expect(code(await portal.invites(owner(), ids.self))).toBe("not_found");
    const service = await addService(db);
    expect(code(await createEngagementService({ store, clock }).create(owner(), { clientId: ids.self, serviceId: service, kind: "retainer", startDate: "2026-10-01", fee: "50000" }))).toBe("invalid");
  });
});

describe("the Oppllo Marketing kit", () => {
  it("marks the space, sets this month's targets and next month's calendar, once; never takes over another self space", async () => {
    await db.update(s.clients).set({ isSelf: false }).where(sql`id = ${ids.self}`);
    const made = value(await kits.apply(owner(), { kit: "marketing", spaceId: ids.self }));
    expect(made.created).toContain("This month's results targets: 40 Sales leads, 2 colleges won");
    const [space] = await db.execute<{ is_self: boolean }>(sql`select is_self from clients where id = ${ids.self}`);
    expect(space!.is_self).toBe(true);
    const [row] = await db.execute<{ target_leads: number; target_admissions: number }>(sql`select target_leads, target_admissions from client_results where client_id = ${ids.self}`);
    expect([row!.target_leads, row!.target_admissions]).toEqual([40, 2]);
    const posts = await db.execute<{ publish_on: string; status: string }>(sql`select publish_on::text, status from content_items where client_id = ${ids.self} order by publish_on`);
    expect(posts.map((p) => [p.publish_on, p.status])).toEqual([["2026-11-03", "idea"], ["2026-11-08", "idea"], ["2026-11-15", "idea"], ["2026-11-22", "idea"]]);
    expect(value(await kits.apply(owner(), { kit: "marketing", spaceId: ids.self })).created).toEqual([]);
    expect(Number((await db.execute<{ n: number }>(sql`select count(*)::int as n from content_items where client_id = ${ids.self}`))[0]!.n)).toBe(4);
    // A second marketing space doesn't take over: the first stays Oppllo's own.
    const second = value(await kits.apply(owner(), { kit: "marketing", newSpaceName: "Marketing 2" }));
    expect(second.created.some((c) => c.startsWith("Mark the space"))).toBe(false);
    expect((await db.execute<{ id: string }>(sql`select id from clients where is_self`)).map((r) => r.id)).toEqual([ids.self]);
  });
});

describe("spaces through the tools", () => {
  function deps(): AssistantDeps {
    const capacity = createCapacityService({ store, clock });
    return {
      ai: createAiService({ store, clock, inrPerUsd: 90 }),
      clients: createClientService({ store, clock }),
      projects: createProjectService({ store, clock }),
      tasks: createTaskService({ store, clock }),
      capacity,
      time: createTimeService({ store, clock }),
      leave: createLeaveService({ store, clock }),
      people: createPeopleService({ store, clock }),
      assets: createAssetService({ store, clock, storage: {} as FileStorage }),
      content: createContentService({ store, clock }),
      dashboard: createDashboardService({ store, clock, capacity }),
      leads: createLeadService({ store, clock, crmConnected: false }),
      ads: createAdService({ store, clock, meta: { connected: false, insights: async () => { throw new Error("off"); } } }),
      results,
      knowledge: createKnowledgeService({ store, clock, storage: {} as FileStorage }),
      clock,
    };
  }
  const run = async (a: ReturnType<typeof owner>, name: string, input: unknown) => {
    const t = assistantTools(a, deps()).find((x) => x.name === name);
    return t ? t.run(input) : { ok: false, text: `no tool ${name}` };
  };

  it("oppllo_results; spaces by name, private ones only for members", async () => {
    await lead("2026-10-02", { channel: "Referral" });
    const own = await run(strategist(), "oppllo_results", {});
    expect(own.text).toContain('"sales_leads":1');
    expect(own.text).toContain("Referral");
    expect((await run(designer(), "oppllo_results", {})).ok).toBe(false); // results.read only
    await addClient(db, "Zenith IAS Academy", { strategistId: ids.strategist });
    expect((await run(designer(), "client_knowledge", { client: "Founder office", search: "" })).ok).toBe(true);
    expect((await run(strategist(), "client_knowledge", { client: "Founder office", search: "" })).text).toContain("No client you can see");
    expect((await run(owner(), "client_knowledge", { client: "Oppllo Marketing", search: "" })).ok).toBe(true);
  });
});
