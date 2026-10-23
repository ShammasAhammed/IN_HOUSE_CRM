// Projects slice 1: My Day, the Board, task rights, comments and one-tap time (plan/3-projects-module.md).
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { newId } from "@/lib/id";
import type { Role } from "@/lib/types";
import { createTaskService } from "@/services/tasks";
import { actorOf, addClient, addPerson, addRetainer, addService, eventsFor, fixedClock, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const tasks = createTaskService({ store, clock: fixedClock("2026-10-14") });

const ids = {} as Record<"owner" | "strategist" | "designer" | "editor" | "intern" | "zenith" | "brightpath" | "zenithProject" | "brightProject" | "retainer", string>;
const roles: Record<string, Role[]> = { owner: ["owner"], strategist: ["strategist"], designer: ["designer"], editor: ["video_editor"], intern: ["intern"] };
const as = (who: "owner" | "strategist" | "designer" | "editor" | "intern") => actorOf(ids[who], roles[who]!);

async function addTask(projectId: string, clientId: string, extra: Partial<typeof s.tasks.$inferInsert> = {}) {
  const id = newId();
  await db.insert(s.tasks).values({ id, projectId, clientId, title: "Task", rank: `a${Math.floor(Math.random() * 9)}`, createdById: ids.strategist, ...extra });
  return id;
}

beforeEach(async () => {
  await wipe(db);
  ids.owner = await addPerson(db, "Faisal Rahman", roles.owner!);
  ids.strategist = await addPerson(db, "Anjali Nair", roles.strategist!);
  ids.designer = await addPerson(db, "Vishnu Prasad", roles.designer!);
  ids.editor = await addPerson(db, "Nikhil Thomas", roles.editor!);
  ids.intern = await addPerson(db, "Hiba Nasrin", roles.intern!);
  const service = await addService(db);
  ids.zenith = await addClient(db, "Zenith IAS Academy", { members: [ids.strategist, ids.designer] });
  ids.brightpath = await addClient(db, "Brightpath Nursing College", { members: [ids.strategist] });
  ids.retainer = await addRetainer(db, ids.zenith, service, { feePaise: 1, budgetMinutes: 2400, periodStart: "2026-10-01", periodEnd: "2026-10-31" });
  ids.zenithProject = newId();
  ids.brightProject = newId();
  await db.insert(s.projects).values([
    { id: ids.zenithProject, clientId: ids.zenith, engagementId: ids.retainer, name: "Meta ads · Oct" },
    { id: ids.brightProject, clientId: ids.brightpath, name: "Brightpath launch" },
  ]);
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("My Day", () => {
  it("shows my overdue, today, coming-up and done-today tasks, nobody else's", async () => {
    await addTask(ids.zenithProject, ids.zenith, { title: "Overdue", ownerId: ids.designer, dueDate: "2026-10-10" });
    await addTask(ids.zenithProject, ids.zenith, { title: "Today low", ownerId: ids.designer, dueDate: "2026-10-14", priority: "low" });
    await addTask(ids.zenithProject, ids.zenith, { title: "Today urgent", ownerId: ids.designer, dueDate: "2026-10-14", priority: "urgent" });
    await addTask(ids.zenithProject, ids.zenith, { title: "Friday", ownerId: ids.designer, dueDate: "2026-10-16" });
    await addTask(ids.zenithProject, ids.zenith, { title: "Next month", ownerId: ids.designer, dueDate: "2026-11-20" });
    await addTask(ids.zenithProject, ids.zenith, { title: "Done today", ownerId: ids.designer, dueDate: "2026-10-14", status: "done", completedAt: new Date("2026-10-14T05:00:00Z") });
    await addTask(ids.zenithProject, ids.zenith, { title: "Someone else's", ownerId: ids.editor, dueDate: "2026-10-14" });
    const r = await tasks.myDay(as("designer"));
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.overdue.map((t) => t.title)).toEqual(["Overdue"]);
    expect(r.value.dueToday.map((t) => t.title)).toEqual(["Today urgent", "Today low"]);
    expect(r.value.comingUp.map((t) => t.title)).toEqual(["Friday"]);
    expect(r.value.doneToday.map((t) => t.title)).toEqual(["Done today"]);
    expect(r.value.overdue[0]).toMatchObject({ overdue: true, canEdit: true, clientName: "Zenith IAS Academy" });
  });
});

describe("who sees which tasks", () => {
  it("shows creatives their clients' tasks and interns only their own", async () => {
    await addTask(ids.zenithProject, ids.zenith, { title: "Zenith work", ownerId: ids.strategist, dueDate: "2026-10-20" });
    await addTask(ids.brightProject, ids.brightpath, { title: "Brightpath work", ownerId: ids.strategist, dueDate: "2026-10-20" });
    await addTask(ids.brightProject, ids.brightpath, { title: "Intern's", ownerId: ids.intern, dueDate: "2026-10-20" });
    const titles = async (who: Parameters<typeof as>[0]) => {
      const r = await tasks.board(as(who), {});
      if (!r.ok) throw new Error(r.error.message);
      return r.value.columns.flatMap((c) => c.tasks.map((t) => t.title)).sort();
    };
    expect(await titles("strategist")).toEqual(["Brightpath work", "Intern's", "Zenith work"]);
    expect(await titles("designer")).toEqual(["Zenith work"]);
    expect(await titles("intern")).toEqual(["Intern's"]);
  });

  it("hides a task outside your scope as not found", async () => {
    const id = await addTask(ids.brightProject, ids.brightpath, { ownerId: ids.strategist });
    expect(await tasks.get(as("designer"), id)).toMatchObject({ ok: false, error: { code: "not_found" } });
  });
});

describe("changing tasks", () => {
  it("lets a creative create tasks in their client's project, not an intern", async () => {
    const r = await tasks.create(as("designer"), { projectId: ids.zenithProject, title: "Static ads v2", ownerId: ids.designer, dueDate: "2026-10-16", estimateHours: "1.5", priority: "", reviewerId: "", stageId: "", startDate: "", description: "" });
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    const t = await tasks.get(as("designer"), r.value.id);
    expect(t.ok && t.value).toMatchObject({ title: "Static ads v2", estimateMinutes: 90, status: "todo", clientName: "Zenith IAS Academy" });
    expect((await tasks.create(as("intern"), { projectId: ids.zenithProject, title: "Mine" })).ok).toBe(false);
    expect((await tasks.create(as("designer"), { projectId: ids.brightProject, title: "Not my client" })).ok).toBe(false);
  });

  it("makes one task from a double Enter, but allows a different title (QA S9-02)", async () => {
    const add = (title: string) => tasks.create(as("designer"), { projectId: ids.zenithProject, title, ownerId: ids.designer });
    const both = await Promise.all([add("TEST Quick add"), add("TEST Quick add")]);
    expect(both.every((r) => r.ok)).toBe(true);
    expect(new Set(both.map((r) => r.ok && r.value.id)).size).toBe(1);
    expect((await add("TEST Quick add 2")).ok).toBe(true);
    const rows = await db.select({ title: s.tasks.title }).from(s.tasks).where(sql`${s.tasks.title} like 'TEST Quick add%'`);
    expect(rows.map((r) => r.title).sort()).toEqual(["TEST Quick add", "TEST Quick add 2"]);
  });

  it("lets the owner of a task complete it, records it, and refuses others", async () => {
    const id = await addTask(ids.zenithProject, ids.zenith, { ownerId: ids.designer, dueDate: "2026-10-14" });
    expect(await tasks.move(as("editor"), { taskId: id, status: "done" })).toMatchObject({ ok: false });
    expect(await tasks.move(as("designer"), { taskId: id, status: "done" })).toEqual({ ok: true, value: { id, status: "done" } });
    const [row] = await db.select().from(s.tasks).where(sql`${s.tasks.id} = ${id}`);
    expect(row?.completedAt).not.toBeNull();
    expect(await tasks.move(as("designer"), { taskId: id, status: "todo" })).toMatchObject({ ok: true });
    expect((await eventsFor(db, id)).map((e) => e.action)).toEqual(["task.completed", "task.reopened"]);
  });

  it("asks before Done while blockers, checklist steps or subtasks are still open (QA S9-03)", async () => {
    const blocker = await addTask(ids.zenithProject, ids.zenith, { title: "TEST Blocker", ownerId: ids.designer });
    const id = await addTask(ids.zenithProject, ids.zenith, { title: "TEST Waiting", ownerId: ids.designer });
    await db.insert(s.taskDependencies).values({ id: newId(), taskId: id, dependsOnId: blocker });
    await db.insert(s.taskChecklistItems).values({ id: newId(), taskId: id, text: "Step", rank: "a0" });
    const r = await tasks.move(as("designer"), { taskId: id, status: "done" });
    expect(r).toMatchObject({ ok: false, error: { code: "conflict", message: "This task still has 1 unfinished task it waits on and 1 open checklist step. Mark it done anyway?" } });
    expect(!r.ok && r.error.fieldErrors?.confirm).toBeDefined();
    expect((await tasks.move(as("designer"), { taskId: id, status: "done", confirmed: true })).ok).toBe(true);
    // Nothing open: no question.
    expect((await tasks.move(as("designer"), { taskId: blocker, status: "done" })).ok).toBe(true);
  });

  it("orders a moved card between its new neighbours", async () => {
    const a = await addTask(ids.zenithProject, ids.zenith, { status: "in_progress", rank: "a1", ownerId: ids.designer });
    const b = await addTask(ids.zenithProject, ids.zenith, { status: "in_progress", rank: "a2", ownerId: ids.designer });
    const c = await addTask(ids.zenithProject, ids.zenith, { status: "todo", rank: "a1", ownerId: ids.designer });
    expect((await tasks.move(as("designer"), { taskId: c, status: "in_progress", afterId: a, beforeId: b })).ok).toBe(true);
    const board = await tasks.board(as("designer"), { projectId: ids.zenithProject });
    expect(board.ok && board.value.columns.find((col) => col.status === "in_progress")!.tasks.map((t) => t.id)).toEqual([a, c, b]);
  });

  it("records only changed fields and reassignment", async () => {
    const id = await addTask(ids.zenithProject, ids.zenith, { title: "Brief", ownerId: ids.designer });
    const base = { taskId: id, title: "Brief", ownerId: ids.designer, priority: "normal" };
    expect(await tasks.update(as("strategist"), base)).toEqual({ ok: true, value: { id } });
    expect(await eventsFor(db, id)).toEqual([]); // nothing changed, nothing recorded
    expect((await tasks.update(as("strategist"), { ...base, ownerId: ids.editor })).ok).toBe(true);
    expect((await eventsFor(db, id)).map((e) => e.action)).toEqual(["task.reassigned"]);
  });

  it("refuses a save from a tab opened before someone else's save (QA S8-B1)", async () => {
    const id = await addTask(ids.zenithProject, ids.zenith, { title: "TEST Stale", ownerId: ids.designer, priority: "high" });
    const opened = await tasks.get(as("strategist"), id);
    if (!opened.ok) throw new Error(opened.error.message);
    const loadedAt = opened.value.updatedAt.toISOString();
    const base = { taskId: id, title: "TEST Stale", ownerId: ids.designer, priority: "high", loadedAt };
    await new Promise((r) => setTimeout(r, 5));
    expect((await tasks.update(as("strategist"), { ...base, priority: "urgent" })).ok).toBe(true);
    const stale = await tasks.update(as("designer"), { ...base, title: "TEST Stale renamed" });
    expect(stale).toMatchObject({ ok: false, error: { code: "conflict" } });
    const now = await tasks.get(as("strategist"), id);
    expect(now.ok && [now.value.priority, now.value.title]).toEqual(["urgent", "TEST Stale"]);
  });

  it("keeps a history of who changed what, in words (test report M4)", async () => {
    const id = await addTask(ids.zenithProject, ids.zenith, { title: "Brief", ownerId: ids.designer, dueDate: "2026-10-20" });
    const base = { taskId: id, title: "Brief", ownerId: ids.designer, priority: "normal", dueDate: "2026-10-20" };
    expect((await tasks.update(as("strategist"), { ...base, dueDate: "2026-10-24", priority: "high" })).ok).toBe(true);
    expect((await tasks.update(as("strategist"), { ...base, dueDate: "2026-10-24", priority: "high", ownerId: ids.editor })).ok).toBe(true);
    expect((await tasks.move(as("editor"), { taskId: id, status: "blocked" })).ok).toBe(true);
    const r = await tasks.activity(as("strategist"), id, { day: (d) => d });
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.map((a) => `${a.who} ${a.text}`)).toEqual([
      "Nikhil Thomas moved it from To do to Blocked",
      "Anjali Nair changed the owner from Vishnu Prasad to Nikhil Thomas",
      "Anjali Nair changed the due date from 2026-10-20 to 2026-10-24 and the priority from Normal to High",
    ]);
    expect((await tasks.activity(as("intern"), id, { day: (d) => d })).ok).toBe(false);
  });

  it("logs every field of one save, owner and stage included, and bulk changes with values (QA S2-B1)", async () => {
    const [plan, doing] = [newId(), newId()];
    await db.insert(s.projectStages).values([
      { id: plan, projectId: ids.zenithProject, name: "To plan", position: 0 },
      { id: doing, projectId: ids.zenithProject, name: "Doing", position: 1 },
    ]);
    const id = await addTask(ids.zenithProject, ids.zenith, { title: "TEST Brief", ownerId: ids.designer, stageId: plan, dueDate: "2026-10-20" });
    const base = { taskId: id, title: "TEST Brief", ownerId: ids.designer, priority: "normal", stageId: plan, dueDate: "2026-10-20" };
    expect((await tasks.update(as("strategist"), { ...base, priority: "low", stageId: doing, ownerId: ids.editor })).ok).toBe(true);
    expect((await tasks.bulk(as("strategist"), { ids: [id], action: "priority", priority: "urgent" })).ok).toBe(true);
    expect((await tasks.bulk(as("strategist"), { ids: [id], action: "due", dueDate: "2026-10-25" })).ok).toBe(true);
    const r = await tasks.activity(as("strategist"), id, { day: (d) => d });
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.map((a) => a.text)).toEqual([
      "changed the due date from 2026-10-20 to 2026-10-25",
      "changed the priority from Low to Urgent",
      "changed the owner from Vishnu Prasad to Nikhil Thomas, the stage from To plan to Doing and the priority from Normal to Low",
    ]);
  });

  it("links a task to its own engagement's deliverable only, and keeps the link when the form doesn't send it", async () => {
    const reels = newId();
    await db.insert(s.deliverables).values({ id: reels, engagementId: ids.retainer, name: "Reels", targetCount: 12 });
    const other = newId();
    const otherEngagement = await addRetainer(db, ids.brightpath, (await db.select({ id: s.services.id }).from(s.services))[0]!.id, { feePaise: 1, budgetMinutes: 60, periodStart: "2026-10-01", periodEnd: "2026-10-31" });
    await db.insert(s.deliverables).values({ id: other, engagementId: otherEngagement, name: "Statics", targetCount: 4 });
    const id = await addTask(ids.zenithProject, ids.zenith, { title: "Reel 1", ownerId: ids.designer });
    const base = { taskId: id, title: "Reel 1", ownerId: ids.designer, priority: "normal" };

    const wrong = await tasks.update(as("strategist"), { ...base, deliverableId: other });
    expect(!wrong.ok && wrong.error.fieldErrors?.deliverableId).toEqual(["Pick one of this engagement's deliverables."]);
    expect((await tasks.update(as("strategist"), { ...base, deliverableId: reels })).ok).toBe(true);
    expect((await tasks.update(as("strategist"), { ...base, title: "Reel one" })).ok).toBe(true);
    const detail = await tasks.get(as("strategist"), id);
    expect(detail.ok && [detail.value.deliverableId, detail.value.deliverables]).toEqual([reels, [{ id: reels, name: "Reels" }]]);
  });

  it("shows creatives only their own hours on someone else's task (D15)", async () => {
    const id = await addTask(ids.zenithProject, ids.zenith, { title: "Shoot", ownerId: ids.editor });
    await db.insert(s.timeEntries).values([
      { id: newId(), taskId: id, personId: ids.editor, clientId: ids.zenith, workDate: "2026-10-13", minutes: 120 },
      { id: newId(), taskId: id, personId: ids.designer, clientId: ids.zenith, workDate: "2026-10-13", minutes: 30 },
    ]);
    const designer = await tasks.get(as("designer"), id);
    if (!designer.ok) throw new Error(designer.error.message);
    expect(designer.value.loggedMinutes).toBeNull();
    expect(designer.value.time.map((e) => e.minutes)).toEqual([30]);
    const lead = await tasks.get(as("strategist"), id);
    expect(lead.ok && [lead.value.loggedMinutes, lead.value.time.length]).toEqual([150, 2]);
    expect((await tasks.get(as("strategist"), "not-an-id")).ok).toBe(false);
  });

  it("refuses a stage from another project", async () => {
    const stage = newId();
    await db.insert(s.projectStages).values({ id: stage, projectId: ids.brightProject, name: "Elsewhere", position: 0 });
    const id = await addTask(ids.zenithProject, ids.zenith, { title: "Brief", ownerId: ids.designer });
    const r = await tasks.update(as("strategist"), { taskId: id, title: "Brief", priority: "normal", stageId: stage });
    expect(!r.ok && r.error.fieldErrors?.stageId).toEqual(["Pick a stage of this project."]);
  });
});

describe("comments and time", () => {
  it("lets anyone who sees a task comment on it", async () => {
    const id = await addTask(ids.zenithProject, ids.zenith, { ownerId: ids.strategist });
    expect((await tasks.comment(as("designer"), { taskId: id, body: "Looks good" })).ok).toBe(true);
    expect((await tasks.comment(as("designer"), { taskId: id, body: "  " })).ok).toBe(false);
    const t = await tasks.get(as("strategist"), id);
    expect(t.ok && t.value.comments.map((c) => [c.authorName, c.body])).toEqual([["Vishnu Prasad", "Looks good"]]);
  });

  it("logs one-tap time against the client's retainer, billable; internal work is not", async () => {
    const id = await addTask(ids.zenithProject, ids.zenith, { ownerId: ids.designer });
    const r = await tasks.logTime(as("designer"), { taskId: id, minutes: "30" });
    expect(r).toMatchObject({ ok: true, value: { loggedTodayMinutes: 30 } });
    await tasks.logTime(as("designer"), { taskId: id, minutes: 60 });
    const [entry] = await db.select().from(s.timeEntries).where(sql`${s.timeEntries.taskId} = ${id}`).limit(1);
    expect(entry).toMatchObject({ engagementId: ids.retainer, billable: true, workDate: "2026-10-14", personId: ids.designer });
    const internal = await addTask(ids.brightProject, ids.brightpath, { ownerId: ids.strategist });
    await tasks.logTime(as("strategist"), { taskId: internal, minutes: 30 });
    const [i] = await db.select().from(s.timeEntries).where(sql`${s.timeEntries.taskId} = ${internal}`);
    expect(i?.billable).toBe(false);
  });

  it("refuses future days and closed months, and only lets you remove your own open time", async () => {
    const id = await addTask(ids.zenithProject, ids.zenith, { ownerId: ids.designer });
    expect(await tasks.logTime(as("designer"), { taskId: id, minutes: 30, workDate: "2026-10-15" })).toMatchObject({ ok: false, error: { code: "invalid" } });
    expect(await tasks.logTime(as("designer"), { taskId: id, minutes: 30, workDate: "2026-08-31" })).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect((await tasks.logTime(as("designer"), { taskId: id, minutes: 30, workDate: "2026-09-30" })).ok).toBe(false); // locked from 6 Oct
    const mine = await tasks.logTime(as("designer"), { taskId: id, minutes: 45 });
    if (!mine.ok) throw new Error(mine.error.message);
    expect((await tasks.removeTime(as("strategist"), mine.value.id)).ok).toBe(true); // a lead (time.manage)
    const again = await tasks.logTime(as("designer"), { taskId: id, minutes: 45 });
    if (!again.ok) throw new Error(again.error.message);
    expect((await tasks.removeTime(as("editor"), again.value.id)).ok).toBe(false);
  });
});

describe("the task list (Stage 9b.1)", () => {
  const titlesOf = async (who: Parameters<typeof as>[0], f: Parameters<typeof tasks.table>[1]) => {
    const r = await tasks.table(as(who), f);
    if (!r.ok) throw new Error(r.error.message);
    return r.value.tasks.map((t) => t.title);
  };

  it("filters by tag, priority, words and due date, open tasks by default, within what you may see", async () => {
    await addTask(ids.zenithProject, ids.zenith, { title: "Reel script", ownerId: ids.designer, dueDate: "2026-10-12", priority: "high", tags: ["Shoot"] });
    await addTask(ids.zenithProject, ids.zenith, { title: "Poster", ownerId: ids.designer, dueDate: "2026-10-14", tags: ["Design"] });
    await addTask(ids.zenithProject, ids.zenith, { title: "Old reel", ownerId: ids.designer, status: "done", completedAt: new Date("2026-10-01T05:00:00Z"), tags: ["Shoot"] });
    await addTask(ids.brightProject, ids.brightpath, { title: "Brightpath reel", ownerId: ids.strategist, tags: ["Shoot"] });
    expect(await titlesOf("strategist", { tag: "Shoot" })).toEqual(["Reel script", "Brightpath reel"]);
    expect(await titlesOf("designer", { tag: "Shoot" })).toEqual(["Reel script"]);
    expect(await titlesOf("strategist", { tag: "Shoot", status: "all" })).toHaveLength(3);
    expect(await titlesOf("strategist", { q: "REEL" })).toEqual(["Reel script", "Brightpath reel"]);
    expect(await titlesOf("strategist", { priority: "high" })).toEqual(["Reel script"]);
    expect(await titlesOf("strategist", { due: "overdue" })).toEqual(["Reel script"]);
    expect(await titlesOf("strategist", { due: "today" })).toEqual(["Poster"]);
    expect(await titlesOf("strategist", { due: "none" })).toEqual(["Brightpath reel"]);
    expect(await titlesOf("strategist", { q: "100%_\\" })).toEqual([]);
    // Words find subtasks too, as global search does (QA S9-21); the plain list stays top-level.
    const parent = await addTask(ids.zenithProject, ids.zenith, { title: "TEST Parent", ownerId: ids.designer });
    await addTask(ids.zenithProject, ids.zenith, { title: "TEST Subtask voiceover", ownerId: ids.designer, parentTaskId: parent });
    expect(await titlesOf("strategist", { q: "voiceover" })).toEqual(["TEST Subtask voiceover"]);
    expect(await titlesOf("strategist", {})).not.toContain("TEST Subtask voiceover");
  });

  it("sorts by due date with empty dates last, by priority weight and by client", async () => {
    await addTask(ids.zenithProject, ids.zenith, { title: "No date", priority: "urgent" });
    await addTask(ids.zenithProject, ids.zenith, { title: "Later", dueDate: "2026-10-20", priority: "low" });
    await addTask(ids.brightProject, ids.brightpath, { title: "Sooner", dueDate: "2026-10-15", priority: "high" });
    expect(await titlesOf("owner", {})).toEqual(["Sooner", "Later", "No date"]);
    expect(await titlesOf("owner", { sort: "due", dir: "desc" })).toEqual(["Later", "Sooner", "No date"]);
    expect(await titlesOf("owner", { sort: "priority" })).toEqual(["No date", "Sooner", "Later"]);
    expect(await titlesOf("owner", { sort: "client" })).toEqual(["Sooner", "Later", "No date"]);
    expect(await titlesOf("owner", { sort: "nonsense" })).toEqual(["Sooner", "Later", "No date"]);
  });

  it("keeps the team's casing for a tag and records only real changes", async () => {
    const a = await addTask(ids.zenithProject, ids.zenith, { ownerId: ids.designer, tags: ["Shoot"] });
    const b = await addTask(ids.zenithProject, ids.zenith, { ownerId: ids.designer });
    expect(await tasks.setTags(as("designer"), { taskId: b, tags: "shoot, Urgent ad, SHOOT" })).toEqual({ ok: true, value: { id: b } });
    const [row] = await db.select({ tags: s.tasks.tags }).from(s.tasks).where(sql`${s.tasks.id} = ${b}`);
    expect(row?.tags).toEqual(["Shoot", "Urgent ad"]);
    expect((await tasks.setTags(as("designer"), { taskId: b, tags: ["Shoot", "Urgent ad"] })).ok).toBe(true);
    expect((await eventsFor(db, b)).map((e) => e.action)).toEqual(["task.tagged"]);
    expect(await tasks.setTags(as("editor"), { taskId: a, tags: [] })).toMatchObject({ ok: false });
    expect(await tasks.tagOptions(as("owner"))).toEqual([
      { tag: "Shoot", count: 2 },
      { tag: "Urgent ad", count: 1 },
    ]);
  });

  it("changes many tasks at once, skipping the ones you may not change, one event each", async () => {
    const mine = await addTask(ids.zenithProject, ids.zenith, { title: "Mine", ownerId: ids.designer });
    const alsoMine = await addTask(ids.zenithProject, ids.zenith, { title: "Also mine", ownerId: ids.designer, status: "in_progress" });
    const notMine = await addTask(ids.zenithProject, ids.zenith, { title: "Editor's", ownerId: ids.editor });
    const hidden = await addTask(ids.brightProject, ids.brightpath, { title: "Brightpath", ownerId: ids.strategist });
    const r = await tasks.bulk(as("designer"), { ids: [mine, alsoMine, notMine, hidden], action: "status", status: "done" });
    expect(r).toEqual({ ok: true, value: { changed: 2, skipped: 2 } });
    const rows = await db.select({ id: s.tasks.id, status: s.tasks.status, completedAt: s.tasks.completedAt, rank: s.tasks.rank }).from(s.tasks);
    const byId = new Map(rows.map((x) => [x.id, x]));
    expect(byId.get(mine)).toMatchObject({ status: "done" });
    expect(byId.get(mine)?.completedAt).not.toBeNull();
    expect(byId.get(alsoMine)?.rank).not.toBe(byId.get(mine)?.rank);
    expect(byId.get(notMine)?.status).toBe("todo");
    expect(byId.get(hidden)?.status).toBe("todo");
    expect((await eventsFor(db, mine)).map((e) => e.action)).toEqual(["task.completed"]);

    expect(await tasks.bulk(as("strategist"), { ids: [mine, notMine], action: "tag_add", tag: "oct drive" })).toEqual({ ok: true, value: { changed: 2, skipped: 0 } });
    expect(await tasks.bulk(as("strategist"), { ids: [mine, notMine], action: "tag_add", tag: "Oct Drive" })).toEqual({ ok: true, value: { changed: 0, skipped: 0 } });
    expect(await tasks.bulk(as("strategist"), { ids: [mine], action: "tag_remove", tag: "OCT DRIVE" })).toEqual({ ok: true, value: { changed: 1, skipped: 0 } });
    expect(await tasks.bulk(as("strategist"), { ids: [notMine], action: "owner", ownerId: ids.designer })).toEqual({ ok: true, value: { changed: 1, skipped: 0 } });
    expect((await eventsFor(db, notMine)).map((e) => e.action)).toEqual(["task.tagged", "task.reassigned"]);
    expect(await tasks.bulk(as("strategist"), { ids: [notMine], action: "status" })).toMatchObject({ ok: false });
  });

  it("shows each person only the tags on tasks they can see, and never done tasks as overdue", async () => {
    await addTask(ids.zenithProject, ids.zenith, { ownerId: ids.designer, tags: ["Zenith only"] });
    await addTask(ids.brightProject, ids.brightpath, { ownerId: ids.intern, tags: ["Intern work"], dueDate: "2026-10-01" });
    await addTask(ids.brightProject, ids.brightpath, { ownerId: ids.intern, status: "done", completedAt: new Date("2026-10-02T05:00:00Z"), dueDate: "2026-10-01" });
    expect((await tasks.tagOptions(as("intern"))).map((t) => t.tag)).toEqual(["Intern work"]);
    expect((await tasks.tagOptions(as("owner"))).map((t) => t.tag).sort()).toEqual(["Intern work", "Zenith only"]);
    expect(await titlesOf("intern", { due: "overdue", status: "all" })).toHaveLength(1);
    expect(await titlesOf("intern", { due: "overdue", status: "done" })).toEqual([]);
  });

  it("refuses a bulk change that doesn't say what to set, and counts tasks already full of tags as skipped", async () => {
    const a = await addTask(ids.zenithProject, ids.zenith, { ownerId: ids.designer, dueDate: "2026-10-20", tags: Array.from({ length: 10 }, (_, i) => `T${i}`) });
    expect(await tasks.bulk(as("strategist"), { ids: [a], action: "owner" })).toMatchObject({ ok: false });
    expect(await tasks.bulk(as("strategist"), { ids: [a], action: "due" })).toMatchObject({ ok: false });
    expect(await tasks.bulk(as("strategist"), { ids: [a], action: "tag_add", tag: "Shoot, Reels" })).toMatchObject({ ok: false });
    expect(await tasks.bulk(as("strategist"), { ids: [a], action: "tag_add", tag: "Eleventh" })).toEqual({ ok: true, value: { changed: 0, skipped: 1 } });
    expect(await tasks.bulk(as("strategist"), { ids: [a], action: "due", dueDate: "" })).toEqual({ ok: true, value: { changed: 1, skipped: 0 } });
    const [row] = await db.select({ dueDate: s.tasks.dueDate, ownerId: s.tasks.ownerId }).from(s.tasks).where(sql`${s.tasks.id} = ${a}`);
    expect(row).toEqual({ dueDate: null, ownerId: ids.designer });
  });

  it("saves views per person, keeping only list settings", async () => {
    const saved = await tasks.saveView(as("designer"), { name: "My shoots", query: "tag=Shoot&owner=me&evil=1&q=" });
    if (!saved.ok) throw new Error(saved.error.message);
    expect(await tasks.views(as("designer"))).toMatchObject([{ id: saved.value.id, name: "My shoots", query: "tag=Shoot&owner=me" }]);
    expect(await tasks.views(as("editor"))).toEqual([]);
    // One name per person (QA S2-B3); someone else may use the same name.
    expect(await tasks.saveView(as("designer"), { name: " my SHOOTS ", query: "tag=Shoot" })).toMatchObject({ ok: false, error: { fieldErrors: { name: ['You already have a view called "My shoots".'] } } });
    expect((await tasks.saveView(as("editor"), { name: "My shoots", query: "tag=Shoot" })).ok).toBe(true);
    expect(await tasks.removeView(as("editor"), saved.value.id)).toMatchObject({ ok: false });
    expect(await tasks.removeView(as("designer"), saved.value.id)).toEqual({ ok: true, value: null });
    expect(await tasks.views(as("designer"))).toEqual([]);
  });
});
