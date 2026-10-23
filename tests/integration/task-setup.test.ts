// Stage 9b.4: global search, custom fields and templates.
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { newId } from "@/lib/id";
import type { Role } from "@/lib/types";
import { createSearchService } from "@/services/search";
import { createTaskCollabService } from "@/services/task-collab";
import { createTaskSetupService } from "@/services/task-setup";
import { createPostgresStorage } from "@/adapters/postgres";
import { actorOf, addClient, addPerson, fixedClock, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const clock = fixedClock("2026-10-14");
const setup = createTaskSetupService({ store, clock });
const search = createSearchService({ store, clock });
const collab = createTaskCollabService({ store, clock, storage: createPostgresStorage(process.env.DATABASE_URL_TEST!, { signLink: () => "/x" }) });

type Who = "owner" | "strategist" | "designer" | "intern" | "bdo";
const ids = {} as Record<Who | "zenith" | "bright" | "zp" | "task", string>;
const roles: Record<Who, Role[]> = { owner: ["owner"], strategist: ["strategist"], designer: ["designer"], intern: ["intern"], bdo: ["bdo"] };
const as = (who: Who) => actorOf(ids[who], roles[who]);
const must = <T,>(r: { ok: true; value: T } | { ok: false; error: { message: string } }): T => {
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};

beforeEach(async () => {
  await wipe(db);
  await db.execute(sql`truncate table templates, task_fields cascade`);
  ids.owner = await addPerson(db, "Faisal Rahman", roles.owner);
  ids.strategist = await addPerson(db, "Anjali Nair", roles.strategist);
  ids.designer = await addPerson(db, "Vishnu Prasad", roles.designer);
  ids.intern = await addPerson(db, "Hiba Nasrin", roles.intern);
  ids.bdo = await addPerson(db, "Muhammed Ajmal", roles.bdo);
  ids.zenith = await addClient(db, "Zenith IAS Academy", { members: [ids.strategist, ids.designer] });
  ids.bright = await addClient(db, "Brightpath Nursing College", { members: [ids.strategist] });
  ids.zp = newId();
  await db.insert(s.projects).values({ id: ids.zp, clientId: ids.zenith, name: "Diwali campaign", startDate: "2026-10-01" });
  ids.task = newId();
  await db.insert(s.tasks).values({ id: ids.task, projectId: ids.zp, clientId: ids.zenith, title: "Diwali reel script", rank: "a0", ownerId: ids.designer, createdById: ids.strategist, startDate: "2026-10-05", dueDate: "2026-10-08", tags: ["Shoot"] });
  const bp = newId();
  await db.insert(s.projects).values({ id: bp, clientId: ids.bright, name: "Diwali offers" });
  await db.insert(s.tasks).values({ id: newId(), projectId: bp, clientId: ids.bright, title: "Diwali poster", rank: "a0", ownerId: ids.strategist, createdById: ids.strategist });
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("global search", () => {
  it("finds tasks, clients and projects within each person's rights", async () => {
    const lead = must(await search.search(as("strategist"), "diwali"));
    expect(lead.tasks.map((t) => t.title).sort()).toEqual(["Diwali poster", "Diwali reel script"]);
    expect(lead.projects.map((p) => p.title).sort()).toEqual(["Diwali campaign", "Diwali offers"]);
    // Status words are labels, not codes (QA S9-14).
    expect(lead.projects.every((p) => / · (Planned|Active|On hold|Completed|Cancelled)$/.test(p.detail))).toBe(true);
    const designer = must(await search.search(as("designer"), "DIWALI"));
    expect(designer.tasks.map((t) => t.title)).toEqual(["Diwali reel script"]);
    expect(designer.projects.map((p) => p.title)).toEqual(["Diwali campaign"]);
    expect(must(await search.search(as("intern"), "diwali")).total).toBe(0);
    expect(must(await search.search(as("designer"), "zenith")).clients.map((c) => c.title)).toEqual(["Zenith IAS Academy"]);
    expect(must(await search.search(as("designer"), "brightpath")).clients).toEqual([]);
    expect(must(await search.search(as("designer"), "anjali")).people.map((p) => p.title)).toEqual(["Anjali Nair"]);
    expect(must(await search.search(as("designer"), "d")).total).toBe(0);
  });
});

describe("custom fields", () => {
  it("lets leads define fields, shows a client's own only on its tasks, and checks values by kind", async () => {
    expect(await setup.addField(as("designer"), { name: "Budget", kind: "number" })).toMatchObject({ ok: false, error: { code: "forbidden" } });
    const budget = must(await setup.addField(as("strategist"), { name: "Budget", kind: "number" })).id;
    const lang = must(await setup.addField(as("strategist"), { name: "Language", kind: "select", options: "English, Malayalam\nEnglish" })).id;
    const zenithOnly = must(await setup.addField(as("strategist"), { name: "Batch", kind: "text", clientId: ids.zenith })).id;
    const brightOnly = must(await setup.addField(as("strategist"), { name: "Ward", kind: "text", clientId: ids.bright })).id;
    expect(await setup.addField(as("strategist"), { name: "Pick", kind: "select", options: "One" })).toMatchObject({ ok: false });
    const f = must(await setup.forTask(as("designer"), ids.task));
    expect(f.fields.map((x) => x.name)).toEqual(["Budget", "Language", "Batch"]);
    expect(f.fields.find((x) => x.id === lang)?.options).toEqual(["English", "Malayalam"]);
    void brightOnly;

    expect(await setup.setValues(as("designer"), ids.task, { [`field:${budget}`]: "abc", [`field:${lang}`]: "Tamil" })).toMatchObject({ ok: false, error: { code: "invalid", fieldErrors: { [`field:${budget}`]: ["Type a number."], [`field:${lang}`]: ["Pick one of the choices."] } } });
    expect(await setup.setValues(as("designer"), ids.task, { [`field:${budget}`]: "25,000", [`field:${lang}`]: "Malayalam", [`field:${zenithOnly}`]: "UPSC 2027" })).toEqual({ ok: true, value: { changed: 3 } });
    expect(await setup.setValues(as("designer"), ids.task, { [`field:${budget}`]: "25000", [`field:${lang}`]: "Malayalam", [`field:${zenithOnly}`]: "UPSC 2027" })).toEqual({ ok: true, value: { changed: 0 } });
    expect(must(await setup.forTask(as("designer"), ids.task)).fields.map((x) => x.value)).toEqual([25000, "Malayalam", "UPSC 2027"]);
    expect(await setup.setValues(as("intern"), ids.task, { [`field:${budget}`]: "1" })).toMatchObject({ ok: false, error: { code: "not_found" } });

    must(await setup.changeField(as("strategist"), { fieldId: lang, action: "up" }));
    must(await setup.changeField(as("strategist"), { fieldId: budget, action: "remove" }));
    expect(must(await setup.forTask(as("designer"), ids.task)).fields.map((x) => x.name)).toEqual(["Language", "Batch"]);
  });
});

describe("templates", () => {
  it("saves a task with its checklist and subtasks and starts new tasks from it", async () => {
    must(await collab.addChecklist(as("designer"), { taskId: ids.task, text: "Hook\nCTA" }));
    await db.insert(s.tasks).values({ id: newId(), projectId: ids.zp, clientId: ids.zenith, parentTaskId: ids.task, title: "Malayalam version", rank: "a0", createdById: ids.strategist });
    expect(await setup.saveTaskTemplate(as("designer"), { sourceId: ids.task, name: "Reel script" })).toMatchObject({ ok: false, error: { code: "forbidden" } });
    const tpl = must(await setup.saveTaskTemplate(as("strategist"), { sourceId: ids.task, name: "Reel script" })).id;
    expect(must(await setup.templates(as("designer"), "task")).templates).toMatchObject([{ name: "Reel script", checklist: 2, subtasks: 1 }]);

    const id = must(await setup.createTask(as("designer"), { templateId: tpl, projectId: ids.zp, title: "Navratri reel script", startDate: "2026-10-20" }));
    const [row] = await db.select().from(s.tasks).where(sql`${s.tasks.id} = ${id.id}`);
    expect(row).toMatchObject({ title: "Navratri reel script", startDate: "2026-10-20", dueDate: "2026-10-23", tags: ["Shoot"], status: "todo" });
    expect((await store.tasks.checklist(id.id)).map((c) => c.text)).toEqual(["Hook", "CTA"]);
    expect((await store.tasks.list({ scope: { kind: "all" }, parentTaskId: id.id })).map((t) => t.title)).toEqual(["Malayalam version"]);
    expect(await setup.createTask(as("intern"), { templateId: tpl, projectId: ids.zp })).toMatchObject({ ok: false });
    // A template carries its client's details: people who can't see that client don't see it.
    expect(must(await setup.templates(as("intern"), "task")).templates).toEqual([]);
    const brightTask = (await store.tasks.list({ scope: { kind: "all" }, search: "Diwali poster" }))[0]!.id;
    const brightTpl = must(await setup.saveTaskTemplate(as("strategist"), { sourceId: brightTask, name: "Poster" })).id;
    expect(must(await setup.templates(as("designer"), "task")).templates.map((t) => t.name)).toEqual(["Reel script"]);
    expect(await setup.createTask(as("designer"), { templateId: brightTpl, projectId: ids.zp })).toMatchObject({ ok: false, error: { code: "not_found" } });
  });

  it("saves a project and starts a new one for another client, dates moved to the new start", async () => {
    await db.insert(s.projectStages).values([
      { id: newId(), projectId: ids.zp, name: "Plan", position: 0 },
      { id: newId(), projectId: ids.zp, name: "Make", position: 1 },
    ]);
    // The project runs 1 Oct – 31 Oct, past its last task (8 Oct): the copy keeps that length (test report L10).
    await db.update(s.projects).set({ dueDate: "2026-10-31" }).where(sql`${s.projects.id} = ${ids.zp}`);
    const tpl = must(await setup.saveProjectTemplate(as("strategist"), { sourceId: ids.zp, name: "Festival campaign" }));
    expect(tpl.tasks).toBe(1);
    const p = must(await setup.createProject(as("strategist"), { templateId: tpl.id, clientId: ids.bright, name: "Onam campaign", startDate: "2027-08-01" }));
    const tasks = await store.tasks.list({ scope: { kind: "all" }, projectId: p.id });
    expect(tasks.map((t) => [t.title, t.startDate, t.dueDate, t.clientId])).toEqual([["Diwali reel script", "2027-08-05", "2027-08-08", ids.bright]]);
    expect((await store.projects.listStages([p.id])).map((s) => s.name)).toEqual(["Plan", "Make"]);
    const [made] = await db.select({ dueDate: s.projects.dueDate }).from(s.projects).where(sql`${s.projects.id} = ${p.id}`);
    expect(made?.dueDate).toBe("2027-08-31");
    expect(await setup.createProject(as("designer"), { templateId: tpl.id, clientId: ids.zenith, name: "X campaign", startDate: "2027-08-01" })).toMatchObject({ ok: false, error: { code: "forbidden" } });
    must(await setup.removeTemplate(as("strategist"), tpl.id));
    expect(must(await setup.templates(as("strategist"), "project")).templates).toEqual([]);
  });
});
