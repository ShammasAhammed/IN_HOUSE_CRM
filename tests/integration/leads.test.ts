// Sales (Stage 10a, D88): who sees leads, and the salesperson's Today.
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { newId } from "@/lib/id";
import { createLeadService } from "@/services/leads";
import { actorOf, addPerson, fixedClock, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const clock = fixedClock("2026-10-15");
const leads = createLeadService({ store, clock, crmConnected: true });
let bdo = "";

const lead = (name: string, extra: Partial<typeof s.leads.$inferInsert> = {}) => ({ id: newId(), name, stage: "new" as const, ...extra });

beforeEach(async () => {
  await wipe(db);
  bdo = await addPerson(db, "Muhammed Ajmal", ["bdo"]);
  await db.insert(s.leads).values([
    lead("Overdue Academy", { ownerId: bdo, stage: "contacted", nextFollowUpAt: new Date("2026-10-14T05:00:00Z") }),
    lead("Today School", { ownerId: bdo, nextFollowUpAt: new Date("2026-10-15T10:00:00Z") }),
    lead("Nobody's College"),
    lead("No Step Institute", { ownerId: bdo, stage: "proposal" }),
    lead("Won Long Ago", { ownerId: bdo, stage: "won", stageChangedAt: new Date("2026-08-01") }),
  ]);
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("sales leads", () => {
  it("are for sales and marketing roles only", async () => {
    expect((await leads.list(actorOf(bdo, ["bdo"]))).ok).toBe(true);
    expect((await leads.list(actorOf(bdo, ["strategist"]))).ok).toBe(true);
    for (const role of ["designer", "intern", "hr", "accountant"] as const) {
      const r = await leads.list(actorOf(bdo, [role]));
      expect(r.ok ? "ok" : r.error.code, role).toBe("forbidden");
    }
  });

  it("make the salesperson's Today like the CRM's", async () => {
    const r = await leads.today(actorOf(bdo, ["bdo"]));
    if (!r.ok) throw new Error(r.error.message);
    const names = (xs: { name: string }[]) => xs.map((l) => l.name);
    expect(names(r.value.overdue)).toEqual(["Overdue Academy"]);
    expect(names(r.value.dueToday)).toEqual(["Today School"]);
    expect(names(r.value.unassigned)).toEqual(["Nobody's College"]);
    expect(names(r.value.noNextStep)).toEqual(["No Step Institute"]);
  });

  it("keeps leads whose CRM owner has no login apart from unassigned ones (test report M5)", async () => {
    await db.insert(s.leads).values(lead("Aswin's Lead", { ownerName: "Aswin M" }));
    const r = await leads.today(actorOf(bdo, ["bdo"]));
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.unassigned.map((l) => l.name)).toEqual(["Nobody's College"]);
    expect(r.value.ownerWithoutLogin.map((l) => `${l.name} · ${l.ownerName}`)).toEqual(["Aswin's Lead · Aswin M"]);
  });

  it("filters 'Unassigned' to leads nobody owns, and 'no Oppllo login' separately (QA S6-B1)", async () => {
    await db.insert(s.leads).values(lead("TEST Aswin's lead", { ownerName: "Aswin M" }));
    const names = async (owner: string) => {
      const r = await leads.list(actorOf(bdo, ["bdo"]), { owner, stage: "all" });
      return r.ok ? r.value.map((l) => l.name).sort() : [];
    };
    expect(await names("none")).toEqual(["Nobody's College"]);
    expect(await names("nologin")).toEqual(["TEST Aswin's lead"]);
  });

  it("lists every owner and groups district spellings in the filters (QA S6-B3)", async () => {
    await db.insert(s.leads).values([
      lead("TEST Calicut lead", { ownerName: "Aswin M", district: "Kozhikkodu" }),
      lead("TEST Kozhikode lead", { ownerId: bdo, district: "Kozhikode" }),
    ]);
    const o = await leads.filterOptions(actorOf(bdo, ["bdo"]));
    if (!o.ok) throw new Error(o.error.message);
    expect(o.value.districts).toEqual(["Kozhikode"]);
    expect(o.value.owners.map((x) => x.label)).toEqual(["Aswin M (no Oppllo login)", "Muhammed Ajmal"]);
    const names = async (f: Record<string, string>) => {
      const r = await leads.list(actorOf(bdo, ["bdo"]), { stage: "all", ...f });
      return r.ok ? r.value.map((l) => l.name).sort() : [];
    };
    expect(await names({ district: "Kozhikode" })).toEqual(["TEST Calicut lead", "TEST Kozhikode lead"]);
    expect(await names({ owner: "crm:Aswin M" })).toEqual(["TEST Calicut lead"]);
  });

  it("counts leads per stage for the dashboard from the same table as Sales (test report M9)", async () => {
    const r = await leads.stageCounts(actorOf(bdo, ["owner"]));
    expect(r.ok && r.value.byStage).toEqual({ new: 2, contacted: 1, proposal: 1, won: 1 });
    expect((await leads.stageCounts(actorOf(bdo, ["designer"]))).ok).toBe(false);
  });

  it("search, filter, and keep old closed leads off the board", async () => {
    const found = await leads.list(actorOf(bdo, ["bdo"]), { q: "today", stage: "all" });
    expect(found.ok && found.value.map((l) => l.name)).toEqual(["Today School"]);
    const wild = await leads.list(actorOf(bdo, ["bdo"]), { q: "%", stage: "all" });
    expect(wild.ok && wild.value).toEqual([]);
    const board = await leads.board(actorOf(bdo, ["bdo"]));
    expect(board.ok && board.value.find((c) => c.stage === "won")!.leads).toEqual([]);
  });
});

describe("working leads after switch day (D91)", () => {
  it("is refused until the owner switches over, and only the owner can", async () => {
    const owner = await addPerson(db, "Faisal Rahman", ["owner"]);
    const svc = createLeadService({ store, clock, crmConnected: true });
    const before = await svc.create(actorOf(bdo, ["bdo"]), { name: "Walk-in" });
    expect(before.ok ? "" : before.error.message).toMatch(/still worked in the CRM/);
    expect((await svc.goLive(actorOf(bdo, ["bdo"]))).ok).toBe(false);
    expect((await svc.goLive(actorOf(owner, ["owner"]))).ok).toBe(true);
    expect((await svc.create(actorOf(bdo, ["bdo"]), { name: "Walk-in", phone: "9400000009" })).ok).toBe(true);
    const strategist = await svc.create(actorOf(bdo, ["strategist"]), { name: "No" });
    expect(strategist.ok ? "ok" : strategist.error.code).toBe("forbidden");
  });

  it("moves stages with a timeline entry, an event and a report to the ads", async () => {
    const owner = await addPerson(db, "Faisal Rahman", ["owner"]);
    const reported: string[] = [];
    const svc = createLeadService({ store, clock, crmConnected: true, onStageChanged: async (id, stage) => reported.push(`${id}:${stage}`) });
    await svc.goLive(actorOf(owner, ["owner"]));
    const [l] = await db.select({ id: s.leads.id }).from(s.leads).where(eq(s.leads.name, "Nobody's College"));
    const a = actorOf(bdo, ["bdo"]);
    const lost = await svc.changeStage(a, { leadId: l!.id, stage: "lost" });
    expect(lost.ok ? "" : lost.error.fieldErrors?.lostReason?.[0]).toMatch(/why it was lost/);
    expect((await svc.changeStage(a, { leadId: l!.id, stage: "contacted" })).ok).toBe(true);
    expect(await svc.changeStage(a, { leadId: l!.id, stage: "contacted" })).toMatchObject({ ok: true });
    expect(reported).toEqual([`${l!.id}:contacted`]);
    expect((await svc.setFollowUp(a, { leadId: l!.id, at: "2026-10-16T10:30" })).ok).toBe(true);
    expect((await svc.addNote(a, { leadId: l!.id, text: "Principal wants the case study" })).ok).toBe(true);
    const page = await svc.page(a, l!.id);
    if (!page.ok) throw new Error(page.error.message);
    // Moving an unowned lead makes it yours, like the CRM.
    expect(page.value.lead).toMatchObject({ stage: "contacted", ownerId: bdo });
    expect(page.value.lead.nextFollowUpAt?.toISOString()).toBe("2026-10-16T05:00:00.000Z");
    expect(page.value.activities.map((x) => x.type).sort()).toEqual(["followup", "note", "stage"]);
    const events = await db.execute(sql`select action from events where entity_id = ${l!.id} order by occurred_at`);
    expect(events.map((e) => e.action)).toEqual(["lead.stage_changed", "lead.follow_up_set", "lead.note_added"]);
  });
});

describe("CRM upgrades (Stage 10b)", () => {
  async function live() {
    const owner = await addPerson(db, "Faisal Rahman", ["owner"]);
    const svc = createLeadService({ store, clock, crmConnected: true });
    await svc.goLive(actorOf(owner, ["owner"]));
    return svc;
  }

  it("tag leads, keep the team's casing, and filter by tag", async () => {
    const svc = await live();
    const a = actorOf(bdo, ["bdo"]);
    const [l1, l2] = await db.select({ id: s.leads.id }).from(s.leads).limit(2);
    expect((await svc.setTags(a, { leadId: l1!.id, tags: "NEET, Malappuram, neet" })).ok).toBe(true);
    expect((await svc.setTags(a, { leadId: l2!.id, tags: "neet" })).ok).toBe(true);
    const tagged = await svc.list(a, { stage: "all", tag: "NEET" });
    expect(tagged.ok && tagged.value.map((l) => l.tags)).toEqual(expect.arrayContaining([["NEET", "Malappuram"], ["NEET"]]));
    const opts = await svc.filterOptions(a);
    expect(opts.ok && opts.value.tags[0]).toEqual({ tag: "NEET", count: 2 });
  });

  it("change many leads at once, with one timeline entry and event each", async () => {
    const svc = await live();
    const a = actorOf(bdo, ["bdo"]);
    const ids = (await db.select({ id: s.leads.id }).from(s.leads).where(eq(s.leads.stage, "new"))).map((r) => r.id);
    const r = await svc.bulk(a, { ids, action: "stage", stage: "contacted" });
    expect(r).toEqual({ ok: true, value: { changed: ids.length } });
    expect((await svc.bulk(a, { ids, action: "tag_add", tag: "Oct drive" })).ok).toBe(true);
    const lost = await svc.bulk(a, { ids, action: "stage", stage: "lost" });
    expect(lost.ok).toBe(false);
    const rows = await db.select({ stage: s.leads.stage, tags: s.leads.tags }).from(s.leads).where(inArray(s.leads.id, ids));
    expect(rows.every((x) => x.stage === "contacted" && x.tags.includes("Oct drive"))).toBe(true);
    const evs = await db.execute(sql`select count(*)::int as n from events where action = 'lead.bulk_stage'`);
    expect(evs[0]!.n).toBe(ids.length);
    const strategist = await svc.bulk(actorOf(bdo, ["strategist"]), { ids, action: "tag_add", tag: "x" });
    expect(strategist.ok ? "ok" : strategist.error.code).toBe("forbidden");
  });

  it("export the filtered leads as CSV for the BDO, safely, and record it", async () => {
    const svc = createLeadService({ store, clock, crmConnected: true });
    await db.insert(s.leads).values({ id: newId(), name: "=HYPERLINK(evil)", stage: "new" });
    const r = await svc.exportCsv(actorOf(bdo, ["bdo"]), { stage: "all" });
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.count).toBe(6);
    expect(r.value.csv).toContain("'=HYPERLINK(evil)");
    const no = await svc.exportCsv(actorOf(bdo, ["strategist"]), {});
    expect(no.ok ? "ok" : no.error.code).toBe("forbidden");
    const ev = await db.execute(sql`select action from events where action = 'leads.exported'`);
    expect(ev).toHaveLength(1);
  });
});

describe("importing leads and catching duplicates (Stage 10b)", () => {
  it("imports new rows, skips duplicates and unusable rows, and tags everything", async () => {
    const owner = await addPerson(db, "Faisal Rahman", ["owner"]);
    const svc = createLeadService({ store, clock, crmConnected: true });
    const { createLeadImportService } = await import("@/services/lead-import");
    const imp = createLeadImportService({ store, clock, isLive: svc.isLive });
    const a = actorOf(bdo, ["bdo"]);
    await db.update(s.leads).set({ phone: "+91 94470 11223" }).where(eq(s.leads.name, "Today School"));
    const rows = [
      { name: "Sr. Lissy", phone: "9400000001", institution: "St. Mary's", tags: "Nursing; Kottayam", note: "Met at expo" },
      { name: "Again", phone: "094000 00001" },
      { name: "Known", phone: "9447011223" },
      { email: "not-an-email" },
      { phone: "12345" },
      {},
    ];
    const before = await imp.preview(a, { rows });
    expect(before.ok ? "" : before.error.message).toMatch(/until switch day/);
    await svc.goLive(actorOf(owner, ["owner"]));
    const check = await imp.preview(a, { fileName: "expo.csv", rows, tag: "Expo Oct" });
    if (!check.ok) throw new Error(check.error.message);
    expect(check.value).toMatchObject({ total: 6, fresh: 1 });
    expect(check.value.duplicates.map((d) => d.matches)).toEqual(["row 2 of the file", "Today School (already in Oppllo)"]);
    expect(check.value.unusable.map((u) => u.row)).toEqual([5, 6, 7]);
    const done = await imp.run(a, { fileName: "expo.csv", rows, tag: "Expo Oct", ownerId: bdo });
    expect(done.ok && done.value.imported).toBe(1);
    const [lead] = await db.select().from(s.leads).where(eq(s.leads.name, "Sr. Lissy"));
    expect(lead).toMatchObject({ origin: "import", ownerId: bdo, tags: ["Nursing", "Kottayam", "Expo Oct"] });
    const [note] = await db.select({ text: s.leadActivities.text }).from(s.leadActivities).where(and(eq(s.leadActivities.leadId, lead!.id), eq(s.leadActivities.type, "note")));
    expect(note!.text).toBe("Met at expo");
    // Running the same file again imports nothing.
    expect(await imp.run(a, { rows })).toMatchObject({ ok: true, value: { imported: 0 } });
  });

  it("warn about a duplicate when adding a lead by hand, unless told it's different", async () => {
    const owner = await addPerson(db, "Faisal Rahman", ["owner"]);
    const svc = createLeadService({ store, clock, crmConnected: true });
    await svc.goLive(actorOf(owner, ["owner"]));
    const a = actorOf(bdo, ["bdo"]);
    expect((await svc.create(a, { name: "One", phone: "9400000077" })).ok).toBe(true);
    const dup = await svc.create(a, { name: "Two", phone: "+91 94000 00077" });
    expect(dup.ok ? "" : dup.error.message).toMatch(/Already in Oppllo: One/);
    expect((await svc.create(a, { name: "Two", phone: "+91 94000 00077", allowDuplicate: "on" })).ok).toBe(true);
  });
});

describe("templates, views and Today flags (Stage 10b)", () => {
  it("open WhatsApp with the lead's details filled in, noted on the timeline after switch day", async () => {
    const svc = createLeadService({ store, clock, crmConnected: true });
    const [l] = await db.select({ id: s.leads.id }).from(s.leads).where(eq(s.leads.name, "Today School"));
    await db.update(s.leads).set({ phone: "94000 00055", institution: "Today School Kottayam" }).where(eq(s.leads.id, l!.id));
    const a = actorOf(bdo, ["bdo"]);
    const r = await svc.whatsapp(a, l!.id, "hello");
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.url.startsWith("https://wa.me/919400000055?text=")).toBe(true);
    expect(decodeURIComponent(r.value.url.split("text=")[1]!)).toContain("Hi Today School, this is Test from Oppllo Digital. Thanks for your enquiry about admissions for Today School Kottayam.");
    expect(await db.select().from(s.leadActivities).where(eq(s.leadActivities.leadId, l!.id))).toHaveLength(0);
    const owner = await addPerson(db, "Faisal Rahman", ["owner"]);
    await svc.goLive(actorOf(owner, ["owner"]));
    await svc.whatsapp(a, l!.id, "hello");
    const acts = await db.select({ text: s.leadActivities.text }).from(s.leadActivities).where(eq(s.leadActivities.leadId, l!.id));
    expect(acts[0]!.text).toMatch(/^WhatsApp \(First hello\): Hi Today School/);
  });

  it("save views per person, keeping only the screen's filters", async () => {
    const svc = createLeadService({ store, clock, crmConnected: true });
    const a = actorOf(bdo, ["bdo"]);
    const saved = await svc.saveView(a, { name: "Hot NEET", query: "stage=open&tag=NEET&score=hot&evil=1" });
    if (!saved.ok) throw new Error(saved.error.message);
    const mine = await svc.views(a);
    expect(mine.ok && mine.value).toEqual([{ id: saved.value.id, name: "Hot NEET", query: "stage=open&tag=NEET&score=hot" }]);
    const other = await addPerson(db, "Anjali Nair", ["strategist"]);
    expect((await svc.removeView(actorOf(other, ["strategist"]), saved.value.id)).ok).toBe(false);
    expect((await svc.removeView(a, saved.value.id)).ok).toBe(true);
  });

  it("flag new leads waiting over 2 hours and leads going cold", async () => {
    const svc = createLeadService({ store, clock, crmConnected: true });
    // The fixed clock is 15 Oct 12:00 IST.
    await db.insert(s.leads).values([
      { id: newId(), name: "Fresh", stage: "new", createdAt: new Date("2026-10-15T06:00:00Z") },
      { id: newId(), name: "Waiting", stage: "new", createdAt: new Date("2026-10-15T02:00:00Z") },
      { id: newId(), name: "Cold", stage: "proposal", ownerId: bdo, nextFollowUpAt: new Date("2026-10-20T05:00:00Z"), updatedAt: new Date("2026-10-01T05:00:00Z") },
    ]);
    const r = await svc.today(actorOf(bdo, ["bdo"]));
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.waiting.map((l) => l.name)).toContain("Waiting");
    expect(r.value.waiting.map((l) => l.name)).not.toContain("Fresh");
    expect(r.value.goingCold.map((l) => l.name)).toEqual(["Cold"]);
  });
});
