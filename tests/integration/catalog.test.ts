// Settings: services, their stages and starter tasks (D19, D20), and the working week (D32, D73).
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { newId } from "@/lib/id";
import { createCatalogService } from "@/services/catalog";
import { createLeaveService } from "@/services/leave";
import { createProjectService } from "@/services/projects";
import { actorOf, addClient, addLeaveSetup, addPerson, fixedClock, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const clock = fixedClock("2026-10-14");
const catalog = createCatalogService({ store, clock });
const ids = {} as Record<"owner" | "strategist", string>;
const owner = () => actorOf(ids.owner, ["owner"]);

async function setup() {
  const r = await catalog.createService(owner(), { name: "Admissions chatbot", description: "" });
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value.id;
}
const view = async (serviceId: string) => {
  const o = await catalog.overview(owner());
  if (!o.ok) throw new Error(o.error.message);
  return o.value.find((x) => x.id === serviceId)!;
};

beforeEach(async () => {
  await wipe(db);
  ids.owner = await addPerson(db, "Faisal Rahman", ["owner"]);
  ids.strategist = await addPerson(db, "Anjali Nair", ["strategist"]);
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("services", () => {
  it("a new service gets the default stages and a unique key", async () => {
    const id = await setup();
    const v = await view(id);
    expect(v).toMatchObject({ key: "admissions_chatbot", active: true });
    expect(v.stages.map((x) => [x.name, x.position])).toEqual([
      ["Onboarding", 0],
      ["Strategy", 1],
      ["Production", 2],
      ["Live", 3],
      ["Reporting", 4],
    ]);
    const dup = await catalog.createService(owner(), { name: "admissions CHATBOT" });
    expect(!dup.ok && dup.error.fieldErrors?.name).toEqual(["There's already a service with that name."]);
  });

  it("retiring hides a service from new engagements", async () => {
    const id = await setup();
    expect((await catalog.updateService(owner(), { serviceId: id, name: "Admissions chatbot", active: "false" })).ok).toBe(true);
    expect((await store.catalog.listServices({ activeOnly: true })).map((x) => x.id)).not.toContain(id);
  });

  it("is for the owner only", async () => {
    const r = await catalog.createService(actorOf(ids.strategist, ["strategist"]), { name: "Mine" });
    expect(r.ok ? "ok" : r.error.code).toBe("forbidden");
  });
});

describe("stages and starter tasks", () => {
  it("starter tasks follow their stage when stages move or go, and positions stay an index", async () => {
    const id = await setup();
    const add = await catalog.addTemplate(owner(), { serviceId: id, title: "Write the bot script", stagePosition: "1", dueOffsetDays: "3", estimateHours: "2", defaultRole: "strategist" });
    expect(add.ok).toBe(true);
    await catalog.addTemplate(owner(), { serviceId: id, title: "Go live", stagePosition: "3", dueOffsetDays: "14", estimateHours: "", defaultRole: "" });
    let v = await view(id);
    const strategy = v.stages.find((x) => x.name === "Strategy")!;
    // Strategy moves down: the script task goes with it.
    expect((await catalog.moveStage(owner(), { stageId: strategy.id, direction: "down" })).ok).toBe(true);
    v = await view(id);
    expect(v.stages.map((x) => x.name)).toEqual(["Onboarding", "Production", "Strategy", "Live", "Reporting"]);
    expect(v.templates.map((t) => [t.title, t.stagePosition])).toEqual([
      ["Write the bot script", 2],
      ["Go live", 3],
    ]);
    // Production goes: later stages shift up, and so do their tasks.
    await catalog.removeStage(owner(), { stageId: v.stages[1]!.id });
    v = await view(id);
    expect(v.stages.map((x) => [x.name, x.position])).toEqual([
      ["Onboarding", 0],
      ["Strategy", 1],
      ["Live", 2],
      ["Reporting", 3],
    ]);
    expect(v.templates.map((t) => [t.title, t.stagePosition, t.estimateMinutes, t.defaultRole])).toEqual([
      ["Write the bot script", 1, 120, "strategist"],
      ["Go live", 2, null, null],
    ]);
  });

  it("a project started afterwards uses the edited stages and tasks", async () => {
    const id = await setup();
    await catalog.addTemplate(owner(), { serviceId: id, title: "Kick-off call", stagePosition: "0", dueOffsetDays: "1" });
    const clientId = await addClient(db, "Zenith IAS Academy", { strategistId: ids.strategist, members: [ids.strategist] });
    const engagementId = newId();
    await db.insert(s.engagements).values({ id: engagementId, clientId, serviceId: id, kind: "one_off", name: "Chatbot", startDate: "2026-10-14" });
    const projects = createProjectService({ store, clock });
    const r = await projects.create(actorOf(ids.strategist, ["strategist"]), { clientId, engagementId, name: "Chatbot", startDate: "2026-10-14", starterTasks: "on" });
    if (!r.ok) throw new Error(r.error.message);
    const tasks = await db.select({ title: s.tasks.title, ownerId: s.tasks.ownerId }).from(s.tasks).where(sql`${s.tasks.projectId} = ${r.value.id}`);
    expect(tasks).toEqual([{ title: "Kick-off call", ownerId: ids.strategist }]);
  });

  it("checks a starter task's stage exists", async () => {
    const id = await setup();
    const r = await catalog.addTemplate(owner(), { serviceId: id, title: "Lost", stagePosition: "9", dueOffsetDays: "1" });
    expect(!r.ok && r.error.fieldErrors?.stagePosition).toEqual(["Pick one of the service's stages."]);
  });
});

describe("the working week", () => {
  it("changes for the owner, records the change, and refuses one that takes someone below zero", async () => {
    const leave = createLeaveService({ store, clock });
    const types = await addLeaveSetup(db);
    const intern = await addPerson(db, "Hiba Nasrin", ["intern"], { employmentType: "intern" });
    // An intern's six days used, Monday to Saturday, with the second Saturday (10 Oct) off: five days counted.
    await db.insert(s.leaveRequests).values({ id: newId(), personId: intern, leaveTypeId: types.casual, startDate: "2026-10-05", endDate: "2026-10-10", status: "approved", reason: "Trip" });
    await db.insert(s.leaveRequests).values({ id: newId(), personId: intern, leaveTypeId: types.casual, startDate: "2026-09-07", endDate: "2026-09-07", status: "approved", reason: "x" });
    // Make every Saturday a working day: the 10th now counts, so 7 of 6 days.
    const r = await leave.setWorkWeek(owner(), { workingWeekdays: ["1", "2", "3", "4", "5", "6"], saturdaysOff: [] });
    expect(!r.ok && r.error.message).toMatch(/Hiba Nasrin below zero/);
    expect(await store.calendar.getSetting("work_week")).toEqual({ workingWeekdays: [1, 2, 3, 4, 5, 6], saturdaysOff: [2] });

    // Saturdays all off: fine.
    const ok = await leave.setWorkWeek(owner(), { workingWeekdays: ["1", "2", "3", "4", "5"], saturdaysOff: [] });
    expect(ok.ok).toBe(true);
    const [event] = await db.select({ action: s.events.action }).from(s.events).where(sql`${s.events.entityType} = 'setting'`);
    expect(event).toEqual({ action: "setting.changed" });
    const hr = await leave.setWorkWeek(actorOf(ids.strategist, ["hr"]), { workingWeekdays: ["1"] });
    expect(hr.ok ? "ok" : hr.error.code).toBe("forbidden");
  });
});
