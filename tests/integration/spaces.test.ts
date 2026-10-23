// Spaces (Stage 14.1): a private space is seen only by its members and the owner. Seeing every client (a strategist)
// never means seeing private spaces, on any path. Two private spaces, so a wrong join shows.
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { newId } from "@/lib/id";
import type { FileStorage } from "@/repositories";
import { createAutomationRuleService } from "@/services/automation-rules";
import { createAutomationService } from "@/services/automations";
import { createClientAdminService } from "@/services/client-admin";
import { createRequestFormService } from "@/services/request-forms";
import { createTaskCollabService } from "@/services/task-collab";
import { createCapacityService } from "@/services/capacity";
import { createDocService } from "@/services/docs";
import { createKnowledgeService } from "@/services/knowledge";
import { createPlanningService } from "@/services/planning";
import { createSearchService } from "@/services/search";
import { createSpaceService } from "@/services/spaces";
import { createSpaceAccessService } from "@/services/space-access";
import { createTalentService } from "@/services/talent";
import { createTaskSetupService } from "@/services/task-setup";
import { createTaskService } from "@/services/tasks";
import { createTimeService } from "@/services/time";
import { actorOf, addClient, addPerson, addProjectWithTask, addTime, eventsFor, fixedClock, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const clock = fixedClock("2026-10-21");
const tasks = createTaskService({ store, clock });
const docs = createDocService({ store, clock });
const search = createSearchService({ store, clock });
const capacity = createCapacityService({ store, clock });
const time = createTimeService({ store, clock });
const planning = createPlanningService({ store, clock });
const knowledge = createKnowledgeService({ store, clock, storage: {} as FileStorage });
const rules = createAutomationRuleService({ store, clock });
const talent = createTalentService({ store, clock });
const setup = createTaskSetupService({ store, clock });
const spaces = createSpaceService({ store, clock });
const access = createSpaceAccessService({ store, clock });
const daily = createAutomationService({ store, clock });
const admin = createClientAdminService({ store, clock });
const collab = createTaskCollabService({ store, clock, storage: {} as FileStorage });
const forms = createRequestFormService({ store, clock });

const ids = { owner: "", strategist: "", designer: "", accountant: "", intern: "", hr: "", founder: "", finance: "", internal: "", taskA: "", taskB: "", taskC: "", internTask: "" };
const owner = () => actorOf(ids.owner, ["owner"]);
const strategist = () => actorOf(ids.strategist, ["strategist"]);
const designer = () => actorOf(ids.designer, ["designer"]);
const accountant = () => actorOf(ids.accountant, ["accountant"]);
const hr = () => actorOf(ids.hr, ["hr"]);

async function addSpace(name: string, isPrivate: boolean, members: string[]) {
  const id = newId();
  await db.insert(s.clients).values({ id, name, isInternal: true, isPrivate, status: "active" });
  for (const personId of members) await db.insert(s.clientMembers).values({ clientId: id, personId });
  return id;
}

async function addTask(clientId: string, title: string, ownerId: string, extra: { status?: "todo" | "done" } = {}) {
  const { taskId } = await addProjectWithTask(db, clientId, { ownerId, dueDate: "2026-10-22", ...extra });
  await db.execute(sql`update tasks set title = ${title}, rank = 'a0', completed_at = ${extra.status === "done" ? sql`'2026-10-20T06:00:00Z'` : sql`null`} where id = ${taskId}`);
  return taskId;
}

const text = (v: unknown) => JSON.stringify(v);

/** Stage 14.2's full flow: HR asks, the owner approves, the member presses "I understand". */
async function grant(spaceId: string, personId: string, roles: Parameters<typeof actorOf>[1], level = "edit") {
  const asked = await access.ask(hr(), { spaceId, personId, level, reason: "Needs it for the work", twoStep: "yes" });
  if (!asked.ok) throw new Error(asked.error.message);
  const decided = await access.decide(owner(), { requestId: asked.value.id, decision: "approve" });
  if (!decided.ok) throw new Error(decided.error.message);
  const confirmed = await access.confirm(actorOf(personId, roles), asked.value.id);
  if (!confirmed.ok) throw new Error(confirmed.error.message);
}

beforeEach(async () => {
  await wipe(db);
  ids.owner = await addPerson(db, "Faisal Rahman", ["owner"]);
  ids.strategist = await addPerson(db, "Anjali Nair", ["strategist"]);
  ids.designer = await addPerson(db, "Nikhil Das", ["designer"]);
  ids.accountant = await addPerson(db, "Lekha Menon", ["accountant"]);
  ids.intern = await addPerson(db, "Rahul K", ["intern"]);
  ids.hr = await addPerson(db, "Divya Suresh", ["hr"]);
  ids.founder = await addSpace("Founder office", true, [ids.designer, ids.intern]);
  ids.finance = await addSpace("Finance", true, [ids.accountant]);
  ids.internal = await addSpace("Oppllo internal", false, []);
  ids.taskA = await addTask(ids.founder, "Secret founder plan", ids.designer);
  ids.taskB = await addTask(ids.finance, "Salary sheet October", ids.accountant);
  ids.taskC = await addTask(ids.internal, "Team lunch", ids.designer);
  ids.internTask = await addTask(ids.founder, "Founder deck polish", ids.intern, { status: "done" });
  await addTime(db, { taskId: ids.taskA, personId: ids.designer, clientId: ids.founder, engagementId: null, minutes: 90, workDate: "2026-10-20" });
  await addTime(db, { taskId: ids.taskC, personId: ids.designer, clientId: ids.internal, engagementId: null, minutes: 30, workDate: "2026-10-20" });
  await docs.create(designer(), { title: "Founder notes", body: "Fundraise plan", clientId: ids.founder });
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("private spaces stay private", () => {
  it("from a strategist who sees every client: lists, task page, search, docs, Week, Time, calendar, knowledge", async () => {
    const st = strategist();
    const list = await tasks.table(st);
    const titles = list.ok ? list.value.tasks.map((t) => t.title) : [];
    expect(titles).toContain("Team lunch");
    expect(titles).not.toContain("Secret founder plan");
    expect(titles).not.toContain("Salary sheet October");
    const page = await tasks.get(st, ids.taskA);
    expect(page.ok ? "ok" : page.error.code).toBe("not_found");
    const found = await search.search(st, "founder");
    expect(found.ok && found.value.total).toBe(0);
    const tree = await docs.tree(st);
    expect(text(tree)).not.toContain("Founder notes");
    const doc = (await db.select({ id: s.docs.id }).from(s.docs))[0]!;
    expect((await docs.get(st, doc.id)).ok).toBe(false);
    // Week shows load, not titles: the private task doesn't count towards what the strategist plans.
    const week = await capacity.week(st, "2026-10-19");
    expect(week.ok && week.value.rows.find((r) => r.personId === ids.designer)?.openTasks).toBe(1);
    expect((await capacity.week(owner(), "2026-10-19")).ok && (await capacity.week(owner(), "2026-10-19"))).toMatchObject({ value: { rows: expect.arrayContaining([expect.objectContaining({ personId: ids.designer, openTasks: 2 })]) } });
    const theirTime = await time.week(st, { personId: ids.designer, start: "2026-10-19" });
    expect(text(theirTime)).not.toContain("Secret founder plan");
    expect(text(theirTime)).toContain("Team lunch");
    const cal = await planning.calendar(st, "2026-10");
    expect(text(cal)).not.toContain("Secret founder plan");
    const kb = await knowledge.forClient(st, ids.founder);
    expect(kb.ok ? "ok" : kb.error.code).toBe("not_found");
    const sp = await spaces.list(st);
    expect(sp.ok && sp.value.spaces.map((x) => x.name)).toEqual(["Oppllo internal"]);
  });

  it("and between private spaces: each member sees their own, not the other one; the owner sees both", async () => {
    const d = await tasks.table(designer());
    const dTitles = d.ok ? d.value.tasks.map((t) => t.title) : [];
    expect(dTitles).toContain("Secret founder plan");
    expect(dTitles).not.toContain("Salary sheet October");
    const a = await spaces.list(accountant());
    expect(a.ok && a.value.spaces.map((x) => x.name)).toEqual(["Finance", "Oppllo internal"]);
    const o = await tasks.table(owner());
    expect(o.ok && o.value.tasks.map((t) => t.title)).toEqual(expect.arrayContaining(["Secret founder plan", "Salary sheet October", "Team lunch"]));
    expect((await docs.tree(designer())).nodes.map((n) => n.title)).toContain("Founder notes");
  });

  it("from notifications: a non-member mentioned on a private task hears nothing; members and the owner do", async () => {
    expect((await tasks.comment(designer(), { taskId: ids.taskA, body: "@Anjali Nair and @Faisal Rahman please look" })).ok).toBe(true);
    const rows = await db.execute<{ person_id: string; title: string }>(sql`select person_id, title from notifications`);
    expect(rows.map((r) => r.person_id)).toEqual([ids.owner]);
  });

  it("from automations: an author's rule for every client never acts inside a private space they aren't in", async () => {
    const rule = { name: "Tag means blocked", active: "on", trigger: JSON.stringify({ type: "tagged" }), conditions: JSON.stringify({}), actions: JSON.stringify([{ type: "set_status", status: "blocked" }]) };
    expect((await rules.save(strategist(), rule)).ok).toBe(true);
    expect((await tasks.setTags(designer(), { taskId: ids.taskA, tags: ["Urgent"] })).ok).toBe(true);
    expect((await tasks.setTags(designer(), { taskId: ids.taskC, tags: ["Urgent"] })).ok).toBe(true);
    const status = async (id: string) => (await db.select({ status: s.tasks.status }).from(s.tasks).where(sql`${s.tasks.id} = ${id}`))[0]!.status;
    expect(await status(ids.taskA)).toBe("todo");
    expect(await status(ids.taskC)).toBe("blocked");
  });

  it("from HR's intern page (counts stay, private titles go) and from templates", async () => {
    const page = await talent.intern(hr(), ids.intern);
    expect(page.ok && page.value.work.tasksDone).toBe(1);
    expect(page.ok && page.value.work.recent).toEqual([]);
    expect((await setup.saveTaskTemplate(owner(), { sourceId: ids.taskA, name: "Founder flow" })).ok).toBe(true);
    const seen = await setup.templates(strategist(), "task");
    expect(seen.ok && seen.value.templates.map((t) => t.name)).not.toContain("Founder flow");
    const own = await setup.templates(designer(), "task");
    expect(own.ok && own.value.templates.map((t) => t.name)).toContain("Founder flow");
  });
});

describe("managing spaces", () => {
  it("members come in through an approved, confirmed request and go in one step; access follows at once", async () => {
    expect((await access.ask(strategist(), { spaceId: ids.founder, personId: ids.strategist, level: "edit", reason: "Let me in please", twoStep: "yes" })).ok).toBe(false);
    const listed = await spaces.list(hr());
    expect(listed.ok && listed.value.spaces.map((x) => [x.name, x.isPrivate, x.canOpen])).toEqual([
      ["Finance", true, false],
      ["Founder office", true, false],
      ["Oppllo internal", false, false],
    ]);
    await grant(ids.founder, ids.strategist, ["strategist"]);
    expect((await tasks.get(strategist(), ids.taskA)).ok).toBe(true);
    expect((await access.remove(hr(), { spaceId: ids.founder, personId: ids.strategist })).ok).toBe(true);
    expect((await tasks.get(strategist(), ids.taskA)).ok).toBe(false);
    expect((await eventsFor(db, ids.founder)).map((e) => e.action)).toEqual(["space.access_removed"]);
  });

  it("the owner adds the suggested set, renames, makes private and archives; nothing becomes private by itself", async () => {
    const r = await spaces.addSuggested(owner());
    expect(r.ok && r.value.created).toBe(4); // Founder office and Finance already exist
    const all = await spaces.list(owner());
    expect(all.ok && all.value.spaces.filter((x) => x.isPrivate).map((x) => x.name)).toEqual(["Finance", "Founder office", "HR"]);
    expect(all.ok && all.value.missingSuggested).toEqual([]);
    expect((await spaces.create(hr(), { name: "Legal", isPrivate: "on" })).ok).toBe(false);
    const dup = await spaces.create(owner(), { name: "finance", isPrivate: "" });
    expect(dup.ok ? null : dup.error.fieldErrors?.name).toEqual(["Pick another name."]);
    // Going private names the people on its open work who aren't members, instead of cutting them off.
    const refused = await spaces.update(owner(), { spaceId: ids.internal, name: "Oppllo internal", isPrivate: "on", archived: "" });
    expect(refused.ok ? null : refused.error.message).toMatch(/Nikhil Das\.$/);
    await grant(ids.internal, ids.designer, ["designer"]);
    expect((await spaces.update(owner(), { spaceId: ids.internal, name: "Oppllo internal", isPrivate: "on", archived: "" })).ok).toBe(true);
    expect((await tasks.get(strategist(), ids.taskC)).ok).toBe(false);
    expect((await spaces.update(owner(), { spaceId: ids.internal, name: "Oppllo team", isPrivate: "", archived: "on" })).ok).toBe(true);
    const after = await spaces.list(strategist());
    expect(after.ok && after.value.spaces.find((x) => x.id === ids.internal)).toMatchObject({ name: "Oppllo team", isPrivate: false, archived: true, canOpen: true });
    expect(after.ok && after.value.spaces.map((x) => x.name).sort()).toEqual(["Operations", "Oppllo Marketing", "Oppllo team", "Sales"]);
  });
});

describe("nobody is put on, or told about, a private space's work from outside it", () => {
  it("the daily job: no overdue note to a non-member owner or a non-member lead; members and clients still get theirs", async () => {
    // Rows made before the space went private (the services now refuse this), straight in the database.
    const outsiderTask = await addTask(ids.finance, "Audit fee follow-up", ids.strategist);
    await db.execute(sql`update tasks set due_date = '2026-10-10' where id in (${outsiderTask}, ${ids.taskB})`);
    await db.execute(sql`update clients set lead_strategist_id = ${ids.strategist} where id = ${ids.finance}`);
    const zenith = await addClient(db, "Zenith IAS Academy", { strategistId: ids.strategist });
    const clientTask = await addTask(zenith, "Ad report", ids.designer);
    await db.execute(sql`update tasks set due_date = '2026-10-10' where id = ${clientTask}`);
    await daily.runDaily();
    const notes = await db.execute<{ person_id: string; title: string }>(sql`select person_id, title from notifications order by title`);
    expect(notes.map((n) => [n.person_id === ids.strategist ? "strategist" : n.person_id === ids.accountant ? "accountant" : n.person_id === ids.designer ? "designer" : "other", n.title])).toEqual([
      ["designer", "Overdue: Ad report"],
      ["accountant", "Overdue: Salary sheet October"],
      ["strategist", "Still overdue: Ad report"],
    ]);
  });

  it("refuses a non-member as owner, reviewer, assignee, watcher or form owner, and makes no watcher from a mention", async () => {
    const d = designer();
    const [project] = await db.select({ id: s.projects.id }).from(s.projects).where(sql`${s.projects.clientId} = ${ids.founder}`).limit(1);
    const created = await tasks.create(d, { projectId: project!.id, title: "Board pack", ownerId: ids.strategist });
    expect(created.ok ? null : created.error.fieldErrors?.ownerId?.[0]).toMatch(/^Add them to the space first/);
    expect((await tasks.create(d, { projectId: project!.id, title: "Board pack", reviewerId: ids.accountant })).ok).toBe(false);
    // The owner sees every space, so may be put on its work.
    expect((await tasks.create(d, { projectId: project!.id, title: "Board pack", ownerId: ids.owner })).ok).toBe(true);
    const moved = await tasks.update(d, { taskId: ids.taskA, title: "Secret founder plan", ownerId: ids.strategist });
    expect(moved.ok).toBe(false);
    const bulk = await tasks.bulk(owner(), { ids: [ids.taskC, ids.taskA], action: "owner", ownerId: ids.strategist });
    expect(bulk.ok ? null : bulk.error.message).toMatch(/Secret founder plan/);
    for (const role of ["assignee", "watcher"] as const) expect((await collab.addPerson(d, { taskId: ids.taskA, personId: ids.accountant, role })).ok).toBe(false);
    expect((await collab.addPerson(d, { taskId: ids.taskA, personId: ids.intern, role: "watcher" })).ok).toBe(true);
    await tasks.comment(d, { taskId: ids.taskA, body: "@Anjali Nair have a look" });
    const people = await store.tasks.people(ids.taskA);
    expect(people.map((p) => p.personId)).toEqual([ids.intern]);
    const form = await forms.save(owner(), { name: "Founder asks", projectId: project!.id, ownerId: ids.strategist, questions: JSON.stringify([{ id: "q1", kind: "short", label: "What", required: true, isTitle: true }]), active: "on" });
    expect(form.ok ? null : form.error.fieldErrors?.ownerId?.[0]).toMatch(/^Add them to the space first/);
  });

  it("keeps space members away from the client team screen: only Spaces adds members", async () => {
    await db.insert(s.clientMembers).values({ clientId: ids.founder, personId: ids.strategist });
    const r = await admin.addMember(strategist(), { clientId: ids.founder, personId: ids.accountant });
    expect(r.ok ? "ok" : r.error.code).toBe("not_found");
  });
});
