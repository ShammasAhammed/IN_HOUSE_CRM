// Permissions are enforced in the service layer (plan/3-projects-module.md, permissions table).
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { newId } from "@/lib/id";
import { createClientService } from "@/services/clients";
import {
  actorOf,
  addClient,
  addPerson,
  addProjectWithTask,
  addRetainer,
  addService,
  addTime,
  fixedClock,
  softDelete,
  testDb,
  testStore,
  wipe,
} from "./harness";

const store = testStore();
const { db, client } = testDb();
const clients = createClientService({ store, clock: fixedClock("2026-10-14") });
const october = { periodStart: "2026-10-01", periodEnd: "2026-10-31" } as const;

const ids = {} as Record<
  "owner" | "strategist" | "designer" | "editor" | "intern" | "hr" | "accountant" | "zenith" | "brightpath" | "codeleap" | "skyline",
  string
>;

beforeAll(async () => {
  await wipe(db);
  ids.owner = await addPerson(db, "Owner One", ["owner"]);
  ids.strategist = await addPerson(db, "Strat Egist", ["strategist"]);
  ids.designer = await addPerson(db, "Dee Signer", ["designer"]);
  ids.editor = await addPerson(db, "Vid Editor", ["video_editor"]);
  ids.intern = await addPerson(db, "Inna Tern", ["intern"]);
  ids.hr = await addPerson(db, "Aitch Arr", ["hr"]);
  ids.accountant = await addPerson(db, "Acco Untant", ["accountant"]);
  const meta = await addService(db);
  const google = await addService(db, "google_ads");

  // Zenith: designer on the team; intern owns one task; one 40h retainer with 34h used.
  ids.zenith = await addClient(db, "Zenith IAS Academy", { strategistId: ids.strategist, members: [ids.strategist, ids.designer] });
  const zenithRetainer = await addRetainer(db, ids.zenith, meta, { feePaise: 65_000_00, budgetMinutes: 40 * 60, ...october });
  await addProjectWithTask(db, ids.zenith, { engagementId: zenithRetainer, ownerId: ids.designer, dueDate: "2026-10-10", loggedMinutes: 34 * 60 });
  await addProjectWithTask(db, ids.zenith, { engagementId: zenithRetainer, ownerId: ids.intern, dueDate: "2026-10-20" });

  // Brightpath: 20h retainer with 5h this month, 9h last month (must not count), and a deleted entry (must not count).
  ids.brightpath = await addClient(db, "Brightpath Nursing College", { strategistId: ids.strategist });
  await addProjectWithTask(db, ids.brightpath, { ownerId: ids.strategist, dueDate: "2026-10-01" });
  const bp = await addRetainer(db, ids.brightpath, meta, { feePaise: 50_000_00, budgetMinutes: 20 * 60, ...october });
  const bpTask = await addProjectWithTask(db, ids.brightpath, { engagementId: bp, ownerId: ids.strategist, status: "done", loggedMinutes: 5 * 60 });
  await addProjectWithTask(db, ids.brightpath, { engagementId: bp, ownerId: ids.strategist, status: "done", loggedMinutes: 9 * 60, workDate: "2026-09-29" });
  const deleted = await addTime(db, { taskId: bpTask.taskId, personId: ids.strategist, clientId: ids.brightpath, engagementId: bp, minutes: 240, workDate: "2026-10-06" });
  await softDelete(db, "time_entries", sql`id = ${deleted}`);

  // CodeLeap: two retainers, one hot (9h of 10h) with 2h of it non-billable; the editor owns a task but is not on the team.
  ids.codeleap = await addClient(db, "CodeLeap Academy", { strategistId: ids.strategist });
  const cl1 = await addRetainer(db, ids.codeleap, meta, { feePaise: 45_000_00, budgetMinutes: 20 * 60, ...october });
  const cl2 = await addRetainer(db, ids.codeleap, google, { feePaise: 10_000_00, budgetMinutes: 10 * 60, ...october });
  await addProjectWithTask(db, ids.codeleap, { engagementId: cl1, ownerId: ids.editor, loggedMinutes: 5 * 60, dueDate: "2026-10-30" });
  const hotTask = await addProjectWithTask(db, ids.codeleap, { engagementId: cl2, ownerId: ids.strategist, status: "done", loggedMinutes: 7 * 60 });
  await addTime(db, { taskId: hotTask.taskId, personId: ids.strategist, clientId: ids.codeleap, engagementId: cl2, minutes: 120, workDate: "2026-10-07", billable: false });

  // Skyline: retainer starting 16 Oct (mid-month), no time yet. Designer was on the team but was removed.
  ids.skyline = await addClient(db, "Skyline Aviation Institute", { members: [ids.designer] });
  await softDelete(db, "client_members", sql`client_id = ${ids.skyline} and person_id = ${ids.designer}`);
  await addRetainer(db, ids.skyline, meta, { feePaise: 60_000_00, budgetMinutes: 20 * 60, ...october, startDate: "2026-10-16" });
  // A deleted contact never shows.
  await softDelete(db, "client_contacts", sql`client_id = ${ids.skyline}`);
});

afterAll(async () => {
  await store.close();
  await client.end();
});

async function listAs(personId: string, roles: Parameters<typeof actorOf>[1]) {
  const result = await clients.list(actorOf(personId, roles));
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe("interns (D13: client and project name only)", () => {
  it("see only clients of their own tasks, with nothing but the name and their own task counts", async () => {
    const { clients: list, visible } = await listAs(ids.intern, ["intern"]);
    expect(visible).toEqual({ profile: false, money: false, burn: false, contacts: false });
    expect(list).toEqual([{ id: ids.zenith, name: "Zenith IAS Academy", openTasks: 1, overdueTasks: 0 }]);
  });

  it("never get contact details, even on the client page", async () => {
    const detail = await clients.get(actorOf(ids.intern, ["intern"]), ids.zenith);
    if (!detail.ok) throw new Error(detail.error.message);
    expect(Object.keys(detail.value.client).sort()).toEqual(["id", "name", "openTasks", "overdueTasks"]);
  });

  it("can't tell another client exists", async () => {
    const result = await clients.get(actorOf(ids.intern, ["intern"]), ids.brightpath);
    expect(result).toEqual({ ok: false, error: { code: "not_found", message: expect.any(String) } });
  });
});

describe("creative roles (no fees, no hours budgets)", () => {
  it("see their team's clients with a profile but no money, burn or contacts", async () => {
    const { clients: list, visible } = await listAs(ids.designer, ["designer"]);
    expect(visible).toEqual({ profile: true, money: false, burn: false, contacts: false });
    expect(list.map((c) => c.name)).toEqual(["Zenith IAS Academy"]); // removed from Skyline's team
    const zenith = list[0]!;
    expect(Object.keys(zenith).sort()).toEqual(["id", "name", "openTasks", "overdueTasks", "profile"]);
    expect(zenith.profile?.services).toEqual(["Meta ads for admissions"]);
  });

  it("see a client where they own a task even when not on its team", async () => {
    const { clients: list } = await listAs(ids.editor, ["video_editor"]);
    expect(list.map((c) => c.name)).toEqual(["CodeLeap Academy"]);
  });
});

describe("other roles", () => {
  it("refuses HR, who has no client work", async () => {
    const result = await clients.list(actorOf(ids.hr, ["hr"]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("forbidden");
  });

  it("shows a strategist burn but not fees", async () => {
    const { clients: list, visible } = await listAs(ids.strategist, ["strategist"]);
    expect(visible).toMatchObject({ money: false, burn: true, contacts: true });
    expect(list.find((c) => c.id === ids.zenith)).not.toHaveProperty("monthlyRetainerPaise");
  });

  it("shows the accountant fees but not burn", async () => {
    const { clients: list } = await listAs(ids.accountant, ["accountant"]);
    const zenith = list.find((c) => c.id === ids.zenith)!;
    expect(zenith.monthlyRetainerPaise).toBe(65_000_00);
    expect(zenith).not.toHaveProperty("burn");
  });
});

describe("the owner, and retainer burn", () => {
  it("sees fees, burn, contacts and team size", async () => {
    const { clients: list } = await listAs(ids.owner, ["owner"]);
    expect(list.map((c) => c.name)).toEqual(["Brightpath Nursing College", "CodeLeap Academy", "Skyline Aviation Institute", "Zenith IAS Academy"]);
    const zenith = list.find((c) => c.id === ids.zenith)!;
    expect(zenith.monthlyRetainerPaise).toBe(65_000_00);
    expect(zenith.burn).toMatchObject({ budgetMinutes: 2400, usedMinutes: 2040, usedPercent: 85, level: "warning", alertLevel: "warning" });
    expect(zenith.primaryContact?.name).toBe("Zenith IAS Academy Director");
    expect(zenith.profile?.teamSize).toBe(2);
    expect(zenith).toMatchObject({ openTasks: 2, overdueTasks: 1 });
    // Skyline's only contact was deleted; its removed team member doesn't count.
    const skyline = list.find((c) => c.id === ids.skyline)!;
    expect(skyline.primaryContact).toBeNull();
    expect(skyline.profile?.teamSize).toBe(0);
  });

  it("counts only each engagement's own time, inside the month, ignoring deleted entries", async () => {
    const { clients: list } = await listAs(ids.owner, ["owner"]);
    expect(list.find((c) => c.id === ids.brightpath)!.burn).toMatchObject({ budgetMinutes: 1200, usedMinutes: 300, usedPercent: 25 });
  });

  it("counts non-billable time towards burn and reports it separately (D26)", async () => {
    const { clients: list } = await listAs(ids.owner, ["owner"]);
    const codeleap = list.find((c) => c.id === ids.codeleap)!;
    // 5h + 7h + 2h non-billable = 14h of 30h.
    expect(codeleap.burn).toMatchObject({ usedMinutes: 840, nonBillableMinutes: 120, usedPercent: 46, level: "ok" });
  });

  it("warns when one retainer is hot even though the total isn't", async () => {
    const { clients: list } = await listAs(ids.owner, ["owner"]);
    const codeleap = list.find((c) => c.id === ids.codeleap)!;
    expect(codeleap.burn?.alertLevel).toBe("warning");
    expect(codeleap.burn?.retainers[0]).toMatchObject({ serviceName: "google_ads", usedPercent: 90, level: "warning" });
  });

  it("measures elapsed time from a mid-month start, not from the 1st", async () => {
    const { clients: list } = await listAs(ids.owner, ["owner"]);
    // Covers 16–31 Oct; on 14 Oct none of it has passed.
    expect(list.find((c) => c.id === ids.skyline)!.burn).toMatchObject({ budgetMinutes: 1200, usedMinutes: 0, elapsedPercent: 0 });
  });

  it("treats a malformed id as not found", async () => {
    expect((await clients.get(actorOf(ids.owner, ["owner"]), "not-a-uuid")).ok).toBe(false);
  });
});

describe("the client page", () => {
  it("gives the owner engagements with fees and burn, and history with fee changes", async () => {
    await db.insert(s.events).values({ id: newId(), action: "engagement.fee_changed", entityType: "engagement", entityId: ids.zenith, clientId: ids.zenith, data: { amountPaise: 1 } });
    const r = await clients.page(actorOf(ids.owner, ["owner"]), ids.zenith);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.engagements[0]).toMatchObject({ feePaise: 65_000_00, burn: expect.objectContaining({ usedPercent: 85 }) });
    expect(r.value.history.map((h) => h.action)).toContain("engagement.fee_changed");
    expect(r.value.client.contacts?.length).toBe(1);
  });

  it("gives a designer the work but no fees, burn, contacts or money history", async () => {
    const r = await clients.page(actorOf(ids.designer, ["designer"]), ids.zenith);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.engagements[0]).not.toHaveProperty("feePaise");
    expect(r.value.engagements[0]).not.toHaveProperty("burn");
    expect(r.value.client).not.toHaveProperty("contacts");
    expect(r.value.history.map((h) => h.action)).not.toContain("engagement.fee_changed");
    expect(r.value.visible.assets).toBe(true);
  });

  it("shows the client's notes to those who see contacts, not to designers (QA S9-08)", async () => {
    await db.update(s.clients).set({ notes: "TEST Prefers WhatsApp" }).where(sql`${s.clients.id} = ${ids.zenith}`);
    const owner = await clients.page(actorOf(ids.owner, ["owner"]), ids.zenith);
    expect(owner.ok && owner.value.notes).toBe("TEST Prefers WhatsApp");
    const designer = await clients.page(actorOf(ids.designer, ["designer"]), ids.zenith);
    expect(designer.ok && designer.value.notes).toBeNull();
  });

  it("keeps contact names out of a designer's history (D14)", async () => {
    await db.insert(s.events).values({ id: newId(), action: "client.contact_added", entityType: "client_contact", entityId: ids.zenith, clientId: ids.zenith, data: { name: "Dr. Anitha" } });
    const designer = await clients.page(actorOf(ids.designer, ["designer"]), ids.zenith);
    expect(designer.ok && designer.value.history.map((h) => h.action)).not.toContain("client.contact_added");
    const strategist = await clients.page(actorOf(ids.strategist, ["strategist"]), ids.zenith);
    expect(strategist.ok && strategist.value.history.map((h) => h.action)).toContain("client.contact_added");
  });

  it("shows the BDO the projects, and the accountant neither projects nor work in the history", async () => {
    await db.insert(s.events).values({ id: newId(), action: "task.completed", entityType: "task", entityId: ids.zenith, clientId: ids.zenith, data: { title: "Reel cut" } });
    const bdo = await clients.page(actorOf(ids.owner, ["bdo"]), ids.zenith);
    if (!bdo.ok) throw new Error(bdo.error.message);
    expect(bdo.value.visible.projects).toBe(true);
    expect(bdo.value.projects).toHaveLength(2);
    const accountant = await clients.page(actorOf(ids.accountant, ["accountant"]), ids.zenith);
    if (!accountant.ok) throw new Error(accountant.error.message);
    expect(accountant.value.visible.projects).toBe(false);
    expect(accountant.value.projects).toEqual([]);
    expect(accountant.value.history.map((h) => h.entityType)).not.toContain("task");
  });

  it("gives an intern only the name and their own work", async () => {
    const r = await clients.page(actorOf(ids.intern, ["intern"]), ids.zenith);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.engagements).toEqual([]);
    expect(r.value.history).toEqual([]);
    expect(r.value.visible.projectCounts).toBe(false);
    expect(r.value.team).toEqual([]);
    expect(r.value.assets).toEqual([]);
  });
});
