// Stage 9b.5: request forms.
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { newId } from "@/lib/id";
import type { Role } from "@/lib/types";
import { createRequestFormService, PUBLIC_DAILY_CAP } from "@/services/request-forms";
import { actorOf, addClient, addPerson, fixedClock, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const forms = createRequestFormService({ store, clock: fixedClock("2026-10-14") });

type Who = "strategist" | "designer" | "intern";
const ids = {} as Record<Who | "zenith" | "project" | "other", string>;
const roles: Record<Who, Role[]> = { strategist: ["strategist"], designer: ["designer"], intern: ["intern"] };
const as = (who: Who) => actorOf(ids[who], roles[who]);
/** A lead who sees only their own clients (today every lead sees all; the checks guard the day that changes). */
const scopedLead = () => {
  const a = as("strategist");
  const caps = new Set(a.capabilities);
  for (const c of ["clients.read.all", "projects.read.all", "tasks.read.all"] as const) caps.delete(c);
  for (const c of ["clients.read.assigned", "projects.read.assigned", "tasks.read.assigned"] as const) caps.add(c);
  return { ...a, capabilities: caps };
};
const questions = JSON.stringify([
  { id: "qwhat", label: "What do you need?", kind: "short", required: true, options: [], isTitle: true },
  { id: "qby", label: "Needed by", kind: "date", required: false, options: [], isTitle: false },
]);

beforeEach(async () => {
  await wipe(db);
  await db.execute(sql`truncate table request_submissions, request_forms cascade`);
  ids.strategist = await addPerson(db, "Anjali Nair", roles.strategist);
  ids.designer = await addPerson(db, "Vishnu Prasad", roles.designer);
  ids.intern = await addPerson(db, "Hiba Nasrin", roles.intern);
  ids.zenith = await addClient(db, "Zenith IAS Academy", { members: [ids.strategist, ids.designer] });
  ids.project = newId();
  await db.insert(s.projects).values({ id: ids.project, clientId: ids.zenith, name: "Design desk" });
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("request forms", () => {
  it("lets leads set up a form; anyone files a request that becomes a task for its owner", async () => {
    expect(await forms.save(as("designer"), { name: "Design request", projectId: ids.project, questions })).toMatchObject({ ok: false, error: { code: "forbidden" } });
    const saved = await forms.save(as("strategist"), { name: "Design request", projectId: ids.project, ownerId: ids.designer, questions, active: "on" });
    if (!saved.ok) throw new Error(saved.error.message);
    expect(saved.value.publicSlug).toBeNull();

    const list = await forms.list(as("intern"));
    expect(list.forms.map((f) => [f.name, f.clientName])).toEqual([["Design request", null]]);
    expect(await forms.submit(as("intern"), saved.value.id, { qwhat: "" })).toMatchObject({ ok: false, error: { code: "invalid", fieldErrors: { qwhat: ["Please answer this."] } } });
    const r = await forms.submit(as("intern"), saved.value.id, { qwhat: "Diwali poster", qby: "2026-10-20" });
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.canOpen).toBe(false);
    const [task] = await db.select().from(s.tasks).where(sql`${s.tasks.id} = ${r.value.taskId}`);
    expect(task).toMatchObject({ title: "Design request: Diwali poster", ownerId: ids.designer, dueDate: "2026-10-20", projectId: ids.project, tags: ["Request"], createdById: ids.intern });
    expect((await store.notifications.list(ids.designer, 5)).map((n) => n.title)).toEqual(["New task: Design request: Diwali poster"]);
    // The task page shows what was asked, question by question (test report L11).
    const asked = await forms.forTask(as("designer"), r.value.taskId);
    expect(asked.ok && asked.value).toMatchObject({ formName: "Design request", answers: [{ value: "Diwali poster" }, { value: "2026-10-20" }] });

    // Turned off, nobody but leads sees it.
    await forms.save(as("strategist"), { formId: saved.value.id, name: "Design request", projectId: ids.project, questions });
    expect((await forms.list(as("intern"))).forms).toEqual([]);
    expect(await forms.submit(as("intern"), saved.value.id, { qwhat: "x" })).toMatchObject({ ok: false, error: { code: "not_found" } });
  });

  it("takes requests through a public link, refuses bots, and caps a day's requests", async () => {
    const saved = await forms.save(as("strategist"), { name: "Client brief", projectId: ids.project, questions, active: "on", public: "on" });
    if (!saved.ok) throw new Error(saved.error.message);
    const slug = saved.value.publicSlug!;
    expect(slug).toMatch(/^[a-z0-9]{12,32}$/);
    expect(await forms.getPublic(slug)).toMatchObject({ ok: true, value: { name: "Client brief" } });
    expect(await forms.submitPublic(slug, { submitterName: "Ravi", qwhat: "Hoarding", website: "spam.com" })).toMatchObject({ ok: false });
    expect(await forms.submitPublic(slug, { submitterName: "Ravi", submitterEmail: "ravi@zenith.in", qwhat: "Hoarding design" })).toEqual({ ok: true, value: { received: true } });
    const [task] = await db.select().from(s.tasks).where(sql`${s.tasks.title} = 'Client brief: Hoarding design'`);
    expect(task?.description).toContain("Ravi (outside, ravi@zenith.in)");
    expect(task?.createdById).toBeNull();
    await db.insert(s.requestSubmissions).values(Array.from({ length: PUBLIC_DAILY_CAP }, () => ({ id: newId(), formId: saved.value.id, submitterName: "x", answers: {} })));
    expect(await forms.submitPublic(slug, { submitterName: "Ravi", qwhat: "Again" })).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(await forms.getPublic("nonexistent123")).toMatchObject({ ok: false });
  });

  it("lets leads change only their own clients' forms, and limits one public sender", async () => {
    ids.other = newId();
    const otherClient = await addClient(db, "Brightpath Nursing College", { members: [] });
    const otherProject = newId();
    await db.insert(s.projects).values({ id: otherProject, clientId: otherClient, name: "Launch" });
    const owner = await addPerson(db, "Faisal Rahman", ["owner"]);
    const theirs = await forms.save(actorOf(owner, ["owner"]), { name: "Brightpath brief", projectId: otherProject, questions, active: "on", public: "on" });
    if (!theirs.ok) throw new Error(theirs.error.message);
    expect(await forms.save(scopedLead(), { formId: theirs.value.id, name: "Mine now", projectId: ids.project, questions, active: "on", public: "on" })).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(await forms.remove(scopedLead(), theirs.value.id)).toMatchObject({ ok: false });
    const seen = (await forms.list(scopedLead())).forms.find((f) => f.id === theirs.value.id);
    expect(seen).toMatchObject({ canManage: false, clientName: null, projectName: "" });

    const slug = theirs.value.publicSlug!;
    for (let n = 0; n < 5; n++) expect((await forms.submitPublic(slug, { submitterName: "Ravi", qwhat: `Ask ${n}` }, "sender-a")).ok).toBe(true);
    expect(await forms.submitPublic(slug, { submitterName: "Ravi", qwhat: "Sixth" }, "sender-a")).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect((await forms.submitPublic(slug, { submitterName: "Meera", qwhat: "Mine" }, "sender-b")).ok).toBe(true);
  });
});
