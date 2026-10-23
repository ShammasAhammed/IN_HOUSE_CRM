// Recurring tasks: rules make real tasks two weeks ahead; changes replace only untouched open tasks (D35, D71).
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { newId } from "@/lib/id";
import { createRecurrenceService } from "@/services/recurrences";
import { actorOf, addClient, addPerson, addTime, eventsFor, fixedClock, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
// 14 Oct 2026 is a Wednesday.
const at = (today: string) => createRecurrenceService({ store, clock: fixedClock(today) });
const ids = {} as Record<"strategist" | "designer" | "editor" | "client" | "project" | "otherStage", string>;
const strategist = () => actorOf(ids.strategist, ["strategist"]);

const live = (recurrenceId: string) =>
  db
    .select({ id: s.tasks.id, title: s.tasks.title, due: s.tasks.dueDate, start: s.tasks.startDate, ownerId: s.tasks.ownerId })
    .from(s.tasks)
    .where(sql`${s.tasks.recurrenceId} = ${recurrenceId} and ${s.tasks.deletedAt} is null`)
    .orderBy(s.tasks.dueDate);

async function weeklyMonday(extra: Record<string, string> = {}) {
  const r = await at("2026-10-14").create(strategist(), {
    projectId: ids.project,
    title: "Weekly ad check",
    ownerId: ids.designer,
    frequency: "weekly",
    weekday: "1",
    leadWorkingDays: "1",
    startsOn: "2026-10-01",
    estimateHours: "1.5",
    ...extra,
  });
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
}

beforeEach(async () => {
  await wipe(db);
  ids.strategist = await addPerson(db, "Anjali Nair", ["strategist"]);
  ids.designer = await addPerson(db, "Vishnu Prasad", ["designer"]);
  ids.editor = await addPerson(db, "Nikhil Thomas", ["video_editor"]);
  ids.client = await addClient(db, "Medcrest NEET Coaching", { strategistId: ids.strategist, members: [ids.strategist, ids.designer] });
  ids.project = newId();
  await db.insert(s.projects).values({ id: ids.project, clientId: ids.client, name: "Admissions campaign", status: "active" });
  const other = newId();
  await db.insert(s.projects).values({ id: other, clientId: ids.client, name: "Other" });
  ids.otherStage = newId();
  await db.insert(s.projectStages).values({ id: ids.otherStage, projectId: other, name: "Elsewhere", position: 0 });
  await db.insert(s.settings).values({ key: "work_week", value: { workingWeekdays: [1, 2, 3, 4, 5, 6], saturdaysOff: [2] } });
  await db.insert(s.holidays).values({ id: newId(), date: "2026-10-20", name: "Vijayadashami" });
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("setting up a rule", () => {
  it("makes the next two weeks of tasks at once, starting a working day early", async () => {
    const { id, tasks } = await weeklyMonday();
    expect(tasks).toBe(2);
    expect((await live(id)).map((t) => [t.due, t.start, t.ownerId])).toEqual([
      ["2026-10-19", "2026-10-17", ids.designer],
      ["2026-10-26", "2026-10-24", ids.designer],
    ]);
    const [task] = await db.select().from(s.tasks).where(sql`${s.tasks.recurrenceId} = ${id}`).limit(1);
    expect(task).toMatchObject({ estimateMinutes: 90, createdById: ids.strategist, status: "todo" });
    expect((await eventsFor(db, id)).map((e) => e.action)).toEqual(["task_recurrence.created"]);
  });

  it("moves a holiday to the working day before", async () => {
    const { id } = await weeklyMonday({ weekday: "2" });
    expect((await live(id)).map((t) => t.due)).toEqual(["2026-10-19", "2026-10-27"]);
  });

  it("is for people who plan work, with the project's own stages", async () => {
    const designer = await at("2026-10-14").create(actorOf(ids.designer, ["designer"]), { projectId: ids.project, title: "Mine", frequency: "weekly", weekday: "1", startsOn: "2026-10-14" });
    expect(designer.ok ? "ok" : designer.error.code).toBe("forbidden");
    const stage = await at("2026-10-14").create(strategist(), { projectId: ids.project, title: "Check", frequency: "weekly", weekday: "1", startsOn: "2026-10-14", stageId: ids.otherStage });
    expect(!stage.ok && stage.error.fieldErrors?.stageId).toEqual(["Pick one of this project's stages."]);
    const day = await at("2026-10-14").create(strategist(), { projectId: ids.project, title: "Check", frequency: "monthly", startsOn: "2026-10-14" });
    expect(!day.ok && day.error.fieldErrors?.dayOfMonth).toEqual(["Pick the day of the month."]);
  });
});

describe("moving a recurring task", () => {
  it("can take another occurrence's due date, and the rule doesn't refill the old one", async () => {
    const { id } = await weeklyMonday();
    const [first] = await live(id);
    await db.update(s.tasks).set({ dueDate: "2026-10-26" }).where(sql`${s.tasks.id} = ${first!.id}`);
    // The rule re-fills from scratch (as after a resume): the 19th's occurrence still exists, just moved.
    await db.update(s.taskRecurrences).set({ generatedUntil: "2026-10-13" }).where(sql`${s.taskRecurrences.id} = ${id}`);
    await at("2026-10-14").runDaily();
    expect((await live(id)).map((t) => t.due)).toEqual(["2026-10-26", "2026-10-26"]);
  });

  it("shows interns only the rules that make tasks for them", async () => {
    await weeklyMonday();
    const intern = await addPerson(db, "Hiba Nasrin", ["intern"]);
    await db.insert(s.tasks).values({ id: newId(), projectId: ids.project, clientId: ids.client, title: "Mine", ownerId: intern });
    const r = await at("2026-10-14").list(actorOf(intern, ["intern"]), ids.project);
    expect(r.ok && r.value.rules).toEqual([]);
  });
});

describe("the daily job", () => {
  it("keeps rules two weeks ahead and can run twice", async () => {
    const { id } = await weeklyMonday();
    const job = at("2026-10-21");
    expect(await job.runDaily()).toEqual({ rules: 1, tasks: 1, errors: [] });
    expect(await job.runDaily()).toEqual({ rules: 1, tasks: 0, errors: [] });
    expect((await live(id)).map((t) => t.due)).toEqual(["2026-10-19", "2026-10-26", "2026-11-02"]);
  });

  it("leaves rules of projects on hold alone", async () => {
    const { id } = await weeklyMonday();
    await db.update(s.projects).set({ status: "on_hold" }).where(sql`${s.projects.id} = ${ids.project}`);
    expect(await at("2026-10-21").runDaily()).toEqual({ rules: 0, tasks: 0, errors: [] });
    expect(await live(id)).toHaveLength(2);
  });
});

describe("changing a rule", () => {
  it("copies new details onto untouched tasks, never onto ones with work on them", async () => {
    const { id } = await weeklyMonday();
    const [first] = await live(id);
    await addTime(db, { taskId: first!.id, personId: ids.designer, clientId: ids.client, engagementId: null, minutes: 30, workDate: "2026-10-14" });
    const r = await at("2026-10-14").update(strategist(), {
      recurrenceId: id,
      title: "Weekly ad check and pacing",
      ownerId: ids.editor,
      frequency: "weekly",
      weekday: "1",
      leadWorkingDays: "1",
      startsOn: "2026-10-01",
      estimateHours: "1.5",
    });
    expect(r.ok).toBe(true);
    expect((await live(id)).map((t) => [t.due, t.title, t.ownerId])).toEqual([
      ["2026-10-19", "Weekly ad check", ids.designer],
      ["2026-10-26", "Weekly ad check and pacing", ids.editor],
    ]);
  });

  it("replaces untouched tasks when the day changes", async () => {
    const { id } = await weeklyMonday();
    const r = await at("2026-10-14").update(strategist(), { recurrenceId: id, title: "Weekly ad check", ownerId: ids.designer, frequency: "weekly", weekday: "4", leadWorkingDays: "1", startsOn: "2026-10-01", estimateHours: "1.5" });
    expect(r.ok).toBe(true);
    expect((await live(id)).map((t) => t.due)).toEqual(["2026-10-15", "2026-10-22"]);
    const removed = await db.select({ id: s.tasks.id }).from(s.tasks).where(sql`${s.tasks.recurrenceId} = ${id} and ${s.tasks.deletedAt} is not null`);
    expect(removed).toHaveLength(2);
  });

  it("pausing removes untouched tasks; resuming brings the same dates back", async () => {
    const { id } = await weeklyMonday();
    const svc = at("2026-10-14");
    expect((await svc.setActive(strategist(), { recurrenceId: id, active: "false" })).ok).toBe(true);
    expect(await live(id)).toEqual([]);
    expect(await at("2026-10-15").runDaily()).toEqual({ rules: 0, tasks: 0, errors: [] });
    expect((await svc.setActive(strategist(), { recurrenceId: id, active: "true" })).ok).toBe(true);
    expect((await live(id)).map((t) => t.due)).toEqual(["2026-10-19", "2026-10-26"]);
    expect((await eventsFor(db, id)).map((e) => e.action)).toEqual(["task_recurrence.created", "task_recurrence.paused", "task_recurrence.resumed"]);
  });

  it("removing it stops it and clears its untouched tasks (soft)", async () => {
    const { id } = await weeklyMonday();
    expect((await at("2026-10-14").remove(strategist(), { recurrenceId: id })).ok).toBe(true);
    expect(await live(id)).toEqual([]);
    expect((await at("2026-10-14").list(strategist(), ids.project)).ok && (await at("2026-10-14").list(strategist(), ids.project))).toMatchObject({ value: { rules: [] } });
    const [rule] = await db.select({ deletedAt: s.taskRecurrences.deletedAt }).from(s.taskRecurrences);
    expect(rule!.deletedAt).not.toBeNull();
  });
});
