// Stage 9b.3: calendar, timeline and dependencies.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { newId } from "@/lib/id";
import type { Role } from "@/lib/types";
import { createPlanningService } from "@/services/planning";
import { createTaskService } from "@/services/tasks";
import { actorOf, addClient, addPerson, eventsFor, fixedClock, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const clock = fixedClock("2026-10-14");
const planning = createPlanningService({ store, clock });
const tasks = createTaskService({ store, clock });

type Who = "owner" | "strategist" | "designer" | "intern";
const ids = {} as Record<Who | "zenith" | "bright" | "zp" | "bp", string>;
const roles: Record<Who, Role[]> = { owner: ["owner"], strategist: ["strategist"], designer: ["designer"], intern: ["intern"] };
const as = (who: Who) => actorOf(ids[who], roles[who]);

async function addTask(title: string, extra: Partial<typeof s.tasks.$inferInsert> = {}) {
  const id = newId();
  await db.insert(s.tasks).values({ id, projectId: ids.zp, clientId: ids.zenith, title, rank: `a${Math.floor(Math.random() * 9)}`, createdById: ids.strategist, ownerId: ids.designer, ...extra });
  return id;
}

beforeEach(async () => {
  await wipe(db);
  ids.owner = await addPerson(db, "Faisal Rahman", roles.owner);
  ids.strategist = await addPerson(db, "Anjali Nair", roles.strategist);
  ids.designer = await addPerson(db, "Vishnu Prasad", roles.designer);
  ids.intern = await addPerson(db, "Hiba Nasrin", roles.intern);
  ids.zenith = await addClient(db, "Zenith IAS Academy", { members: [ids.strategist, ids.designer] });
  ids.bright = await addClient(db, "Brightpath Nursing College", { members: [ids.strategist] });
  ids.zp = newId();
  ids.bp = newId();
  await db.insert(s.projects).values([
    { id: ids.zp, clientId: ids.zenith, name: "Meta ads · Oct" },
    { id: ids.bp, clientId: ids.bright, name: "Launch" },
  ]);
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("calendar", () => {
  it("puts open tasks you can see on their due day across whole weeks", async () => {
    await addTask("Reel", { dueDate: "2026-10-14" });
    await addTask("Poster", { dueDate: "2026-11-01" });
    await addTask("Old", { dueDate: "2026-10-02", status: "done", completedAt: new Date("2026-10-02T05:00:00Z") });
    await addTask("Bright", { projectId: ids.bp, clientId: ids.bright, ownerId: ids.strategist, dueDate: "2026-10-14" });
    await addTask("Next month", { dueDate: "2026-11-20" });
    const r = await planning.calendar(as("designer"), "2026-10");
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.days[0]).toBe("2026-09-28");
    expect(Object.fromEntries(Object.entries(r.value.byDay).map(([d, ts]) => [d, ts.map((t) => t.title)]))).toEqual({ "2026-10-14": ["Reel"], "2026-11-01": ["Poster"] });
    const all = await planning.calendar(as("owner"), "2026-10", { status: "all" });
    expect(all.ok && all.value.byDay["2026-10-02"]?.map((t) => t.title)).toEqual(["Old"]);
    expect(all.ok && all.value.byDay["2026-10-14"]?.length).toBe(2);
    expect((await planning.calendar(as("owner"), "nonsense")).ok && (await planning.calendar(as("owner"), "nonsense"))).toMatchObject({ value: { month: "2026-10-01" } });
  });
});

describe("timeline", () => {
  it("draws start-to-due bars cut to the window, grouped by project, with the links between them", async () => {
    const script = await addTask("Script", { startDate: "2026-10-05", dueDate: "2026-10-08" });
    const shoot = await addTask("Shoot", { dueDate: "2026-10-12" });
    await addTask("Long", { startDate: "2026-09-01", dueDate: "2026-10-30" });
    await addTask("Outside", { dueDate: "2026-12-01" });
    await addTask("No date");
    await db.insert(s.taskDependencies).values({ id: newId(), taskId: shoot, dependsOnId: script });
    const r = await planning.timeline(as("strategist"), "2026-10-07", 2);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.from).toBe("2026-10-05");
    expect(r.value.days).toHaveLength(14);
    expect(r.value.rows.map((g) => g.projectName)).toEqual(["Meta ads · Oct"]);
    expect(r.value.rows[0]!.tasks.map((t) => [t.title, t.bar.offset, t.bar.length, t.bar.startsBefore, t.bar.endsAfter])).toEqual([
      ["Long", 0, 14, true, true],
      ["Script", 0, 4, false, false],
      ["Shoot", 7, 1, false, false],
    ]);
    expect(r.value.links).toEqual([{ taskId: shoot, dependsOnId: script }]);
  });
});

describe("dependencies", () => {
  it("links tasks, refuses loops, and tells whoever waits when the blocker is done", async () => {
    const script = await addTask("Script", { ownerId: ids.strategist });
    const shoot = await addTask("Shoot");
    const edit = await addTask("Edit");
    expect(await planning.addDependency(as("designer"), { taskId: shoot, dependsOnId: script })).toEqual({ ok: true, value: null });
    expect(await planning.addDependency(as("designer"), { taskId: edit, dependsOnId: shoot })).toEqual({ ok: true, value: null });
    expect(await planning.addDependency(as("strategist"), { taskId: script, dependsOnId: edit })).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(await planning.addDependency(as("designer"), { taskId: shoot, dependsOnId: shoot })).toMatchObject({ ok: false });
    expect(await planning.addDependency(as("intern"), { taskId: shoot, dependsOnId: script })).toMatchObject({ ok: false, error: { code: "not_found" } });
    const d = await planning.dependencies(as("designer"), shoot);
    expect(d.ok && [d.value.waitingOn.map((t) => t.title), d.value.blocking.map((t) => t.title), d.value.hidden]).toEqual([["Script"], ["Edit"], 0]);

    await tasks.move(as("strategist"), { taskId: script, status: "done" });
    expect((await store.notifications.list(ids.designer, 10)).map((n) => n.title)).toEqual(["Ready to start: Shoot"]);
    expect(await planning.removeDependency(as("designer"), { taskId: shoot, dependsOnId: script })).toEqual({ ok: true, value: null });
    expect((await eventsFor(db, shoot)).map((e) => e.action)).toEqual(["task.dependency_added", "task.dependency_removed"]);
  });

  it("never offers a task's own subtasks or its parent as a blocker (QA S9-03)", async () => {
    const parent = await addTask("TEST Parent");
    const child = await addTask("TEST Child", { parentTaskId: parent });
    const other = await addTask("TEST Other");
    expect((await planning.blockerOptions(as("designer"), parent)).map((o) => o.id)).toEqual([other]);
    expect((await planning.blockerOptions(as("designer"), child)).map((o) => o.id)).toEqual([other]);
  });

  it("counts blockers you can't see without showing them", async () => {
    const brief = await addTask("Secret brief");
    const reel = await addTask("Reel", { ownerId: ids.intern });
    const bright = await addTask("Brightpath brief", { projectId: ids.bp, clientId: ids.bright, ownerId: ids.strategist });
    expect(await planning.addDependency(as("strategist"), { taskId: reel, dependsOnId: bright })).toMatchObject({ ok: false, error: { code: "invalid" } });
    expect((await planning.addDependency(as("strategist"), { taskId: reel, dependsOnId: brief })).ok).toBe(true);
    await tasks.move(as("designer"), { taskId: brief, status: "done" });
    expect((await store.notifications.list(ids.intern, 10)).map((n) => n.body)).toEqual(["Everything it waited on is done."]);
    const d = await planning.dependencies(as("intern"), reel);
    expect(d.ok && d.value).toMatchObject({ waitingOn: [], hidden: 1 });
  });
});
