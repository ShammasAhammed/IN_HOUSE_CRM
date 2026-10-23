// The event bus and notifications (Stage 8.1, D82).
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createPostgresStorage } from "@/adapters/postgres";
import * as s from "@/db/schema";
import { newId } from "@/lib/id";
import { createAssetService } from "@/services/assets";
import { createNotificationService } from "@/services/notifications";
import { createTaskService } from "@/services/tasks";
import { actorOf, addClient, addPerson, addProjectWithTask, fixedClock, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const storage = createPostgresStorage(process.env.DATABASE_URL_TEST!, { signLink: ({ fileId }) => `/files/${fileId}` });
const clock = fixedClock("2026-10-14");
const sent: Array<{ to: string; subject: string; text: string }> = [];
const notes = createNotificationService({ store, clock, mailer: { send: async (m) => void sent.push(m) }, appUrl: "https://one.test" });
const assets = createAssetService({ store, storage, clock });
const tasks = createTaskService({ store, clock });
const ids = {} as Record<"strategist" | "designer" | "client" | "task" | "project", string>;
const strategist = () => actorOf(ids.strategist, ["strategist"]);
const designer = () => actorOf(ids.designer, ["designer"]);
const titles = async (personId: string) => (await store.notifications.list(personId, 20)).map((n) => n.title);

beforeEach(async () => {
  await wipe(db);
  sent.length = 0;
  ids.strategist = await addPerson(db, "Anjali Nair", ["strategist"]);
  ids.designer = await addPerson(db, "Vishnu Prasad", ["designer"]);
  ids.client = await addClient(db, "Zenith IAS Academy", { strategistId: ids.strategist, members: [ids.designer] });
  const p = await addProjectWithTask(db, ids.client, { ownerId: ids.designer });
  ids.task = p.taskId;
  // An empty project for new tasks (the fixture task has no board rank).
  ids.project = newId();
  await db.insert(s.projects).values({ id: ids.project, clientId: ids.client, name: "Ads" });
});

afterAll(async () => {
  await Promise.all([store.close(), storage.close(), client.end()]);
});

describe("notifications from events", () => {
  it("tell the reviewer about a creative to review, and the maker about the answer, never the person acting", async () => {
    const a = await assets.create(designer(), { clientId: ids.client, taskId: ids.task, title: "Diwali post", link: "https://www.canva.com/d/x", submit: "on" }, null);
    if (!a.ok) throw new Error("create");
    expect(await titles(ids.strategist)).toEqual(["A creative is ready for your review"]);
    expect(await titles(ids.designer)).toEqual([]);
    const [v] = await store.assets.listVersions(a.value.id);
    await assets.review(strategist(), { assetId: a.value.id, versionId: v!.id, action: "request_changes", note: "Logo bigger" });
    const mine = await store.notifications.list(ids.designer, 5);
    expect(mine.map((n) => [n.title, n.body, n.link])).toEqual([["Changes asked on your creative", "Logo bigger", `/creatives/${a.value.id}`]]);
  });

  it("tell someone when a task is given to them", async () => {
    const r = await tasks.create(strategist(), { projectId: ids.project, title: "Reel script", ownerId: ids.designer });
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    expect(await titles(ids.designer)).toEqual(["New task: Reel script"]);
  });

  it("are read only by their person, and unread ones are emailed once", async () => {
    await tasks.create(strategist(), { projectId: ids.project, title: "Reel script", ownerId: ids.designer });
    await tasks.create(strategist(), { projectId: ids.project, title: "Poster", ownerId: ids.designer });
    expect(await notes.unreadCount(designer())).toBe(2);
    await notes.markRead(strategist(), "all");
    expect(await notes.unreadCount(designer())).toBe(2);
    expect((await notes.emailDigest()).sent).toBe(1);
    expect(sent[0]).toMatchObject({ subject: "2 things waiting for you in Oppllo One" });
    expect(sent[0]!.text).toContain("https://one.test/tasks/");
    expect((await notes.emailDigest()).sent).toBe(0);
    await notes.markRead(designer(), "all");
    expect(await notes.unreadCount(designer())).toBe(0);
  });

  it("can be marked read one at a time, and only by their person (QA S1-01)", async () => {
    await tasks.create(strategist(), { projectId: ids.project, title: "TEST One", ownerId: ids.designer });
    await tasks.create(strategist(), { projectId: ids.project, title: "TEST Two", ownerId: ids.designer });
    const list = await notes.list(designer());
    const first = list.ok ? list.value[0]!.id : "";
    await notes.markRead(strategist(), [first]);
    expect(await notes.unreadCount(designer())).toBe(2);
    await notes.markRead(designer(), [first]);
    expect(await notes.unreadCount(designer())).toBe(1);
  });
});

describe("the daily automations (D83)", () => {
  it("ping the owner of an overdue task, then the lead, once each", async () => {
    const { createAutomationService } = await import("@/services/automations");
    const { sql } = await import("drizzle-orm");
    await db.update(s.tasks).set({ dueDate: "2026-10-10", title: "Reel edit" }).where(sql`${s.tasks.id} = ${ids.task}`);
    const auto = createAutomationService({ store, clock });
    await auto.runDaily();
    await auto.runDaily();
    expect(await titles(ids.designer)).toEqual(["Overdue: Reel edit"]);
    expect(await titles(ids.strategist)).toEqual(["Still overdue: Reel edit"]);
  });
});

describe("won leads from the CRM (D84)", () => {
  it("wait on a list until a client carries the lead's id", async () => {
    const { createCrmService } = await import("@/services/crm");
    const { sql } = await import("drizzle-orm");
    const bdo = await addPerson(db, "Muhammed Ajmal", ["bdo"]);
    const crm = createCrmService({ store, clock, source: { connected: true, listWon: async () => [{ id: "lead1", name: "Dr. Ramesh", institution: "Zenith Academy", phone: null, segment: "coaching", ownerName: "Ajmal", stage: "won", wonAt: new Date() }], stageCounts: async () => ({}), allLeads: async () => [], allActivities: async () => [], users: async () => [], sources: async () => [], conversionSettings: async () => null } });
    expect((await crm.sync()).won).toBe(1);
    await crm.sync();
    const list = await crm.inbox(actorOf(bdo, ["bdo"]));
    expect(list.ok && list.value.leads.map((l) => l.institution)).toEqual(["Zenith Academy"]);
    const pre = await crm.prefill(actorOf(bdo, ["bdo"]), list.ok ? list.value.leads[0]!.rowId : "");
    expect(pre.ok && pre.value).toMatchObject({ name: "Zenith Academy", segment: "coaching", crmLeadId: "lead1" });
    expect((await crm.inbox(designer())).ok).toBe(false);
    await db.update(s.clients).set({ crmLeadId: "lead1" }).where(sql`${s.clients.id} = ${ids.client}`);
    const after = await crm.inbox(actorOf(bdo, ["bdo"]));
    expect(after.ok && after.value.leads).toEqual([]);
  });
});

describe("copying the CRM's leads (Stage 10a, D88)", () => {
  it("copies leads and timelines, matches owners by email, and can run again without duplicates", async () => {
    const { createCrmService } = await import("@/services/crm");
    const bdo = await addPerson(db, "Muhammed Ajmal", ["bdo"]);
    const email = (await db.execute(sql`select work_email from people where id = ${bdo}`))[0]!.work_email as string;
    const lead = (id: string, stage: "new" | "won") => ({
      stageChangedAt: stage === "won" ? new Date("2026-10-10") : null,
      crmId: id, externalId: null as string | null, sourceKey: null, name: `Lead ${id}`, phone: null, email: null, institution: null, contactRole: null, district: null, segment: null, problem: null, timeline: null,
      seats: null, admissions: null, feePaise: null, spendPaise: null, commissionPaise: null, costPerAdmissionPaise: null, stage, score: null, lostReason: null,
      origin: "landing", channel: null, landing: null, campaign: null, utmSource: null, utmMedium: null, utmContent: null, utmTerm: null,
      ownerCrmUid: "u1", ownerName: "Ajmal", nextFollowUpAt: null, wonAt: null, lastNoteAt: null, answers: null, details: null,
      createdAt: new Date("2026-10-01"), updatedAt: new Date("2026-10-01"),
    });
    let stage: "new" | "won" = "new";
    let extra: ReturnType<typeof lead>[] = [];
    const source = {
      connected: true,
      listWon: async () => [],
      stageCounts: async () => ({}),
      users: async () => [{ uid: "u1", name: "Ajmal", email: email.toUpperCase().toLowerCase(), role: "sales", active: true }, { uid: "u2", name: "Old intern", email: "gone@example.com", role: "sales", active: false }],
      allLeads: async () => [lead("a", stage), lead("b", "new"), ...extra],
      conversionSettings: async () => ({ stages: { won: { meta: "Converted", google: "CRM Won", valuePaise: null } }, metaDatasetId: "ds1", metaTestEventCode: null }),
      sources: async () => [{ key: "lp1", name: "Admissions LP", url: "https://admissions.oppllo.com", channel: null, active: true, leadCount: 4, lastLeadAt: null }],
      allActivities: async () => [{ crmId: "a/1", leadCrmId: "a", type: "note" as const, text: "Called", fromStage: null, toStage: null, byCrmUid: "u1", byName: "Ajmal", at: new Date("2026-10-02") }],
    };
    const crm = createCrmService({ store, clock, source });
    const first = await crm.copyLeads();
    expect(first).toMatchObject({ inserted: 2, updated: 0, activities: 1, inCrm: 2, here: 2, unmatchedOwners: ["Old intern"], errors: [] });
    stage = "won";
    const second = await crm.copyLeads();
    expect(second).toMatchObject({ inserted: 0, updated: 2, activities: 0, here: 2 });
    const rows = await db.execute(sql`select crm_id, stage, owner_id, stage_changed_at from leads order by crm_id`);
    // Multi-word columns update too (not just stage).
    expect(rows[0]!.stage_changed_at).not.toBeNull();
    expect(rows.map((r) => [r.crm_id, r.stage, r.owner_id])).toEqual([["a", "won", bdo], ["b", "new", bdo]]);
    expect(await store.leads.findSource("lp1")).toMatchObject({ name: "Admissions LP", active: true });
    expect(await store.calendar.getSetting("ad_conversions")).toMatchObject({ metaDatasetId: "ds1", stages: { won: { google: "CRM Won" } } });

    // A Meta lead received here directly is adopted by the CRM's copy, not duplicated.
    await db.insert(s.leads).values({ id: newId(), name: "Direct", stage: "new", externalId: "meta_9" });
    extra = [{ ...lead("meta_9", "new"), externalId: "meta_9" }];
    expect(await crm.copyLeads()).toMatchObject({ errors: [], inCrm: 3, here: 3 });
    // A lead deleted in the CRM is soft-deleted here.
    extra = [];
    expect(await crm.copyLeads()).toMatchObject({ errors: [], inCrm: 2, here: 2 });
    // After switch day the copy adds new CRM leads but never changes ours.
    await store.calendar.setSetting("sales_live", { since: "x", byId: bdo }, bdo);
    await db.execute(sql`update leads set name = 'Edited here' where crm_id = 'a'`);
    extra = [lead("c", "new")];
    await crm.copyLeads();
    const after = await db.execute(sql`select crm_id, name from leads where deleted_at is null order by crm_id`);
    expect(after.map((r) => [r.crm_id, r.name])).toEqual([["a", "Edited here"], ["b", "Lead b"], ["c", "Lead c"]]);
  });
});
