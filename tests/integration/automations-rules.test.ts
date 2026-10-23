// Stage 9b.5: automation rules.
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { addDays, istDate } from "@/lib/dates";
import { newId } from "@/lib/id";
import type { Role } from "@/lib/types";
import { createAutomationRuleService } from "@/services/automation-rules";
import { createTaskService } from "@/services/tasks";
import { actorOf, addClient, addPerson, eventsFor, fixedClock, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const clock = fixedClock("2026-10-14");
const rules = createAutomationRuleService({ store, clock });
const tasks = createTaskService({ store, clock });

type Who = "owner" | "strategist" | "designer";
const ids = {} as Record<Who | "zenith" | "bright" | "zp" | "bp", string>;
const roles: Record<Who, Role[]> = { owner: ["owner"], strategist: ["strategist"], designer: ["designer"] };
const as = (who: Who) => actorOf(ids[who], roles[who]);
/** A lead who sees only their own clients (today every lead sees all; the checks guard the day that changes). */
const scopedLead = () => {
  const a = as("strategist");
  const caps = new Set(a.capabilities);
  for (const c of ["clients.read.all", "projects.read.all", "tasks.read.all"] as const) caps.delete(c);
  for (const c of ["clients.read.assigned", "projects.read.assigned", "tasks.read.assigned"] as const) caps.add(c);
  return { ...a, capabilities: caps };
};
const rule = (name: string, trigger: object, conditions: object, actions: object[]) => ({ name, active: "on", trigger: JSON.stringify(trigger), conditions: JSON.stringify(conditions), actions: JSON.stringify(actions) });
const row = async (id: string) => (await db.select().from(s.tasks).where(sql`${s.tasks.id} = ${id}`))[0]!;

beforeEach(async () => {
  await wipe(db);
  await db.execute(sql`truncate table automations cascade`);
  ids.owner = await addPerson(db, "Faisal Rahman", roles.owner);
  ids.strategist = await addPerson(db, "Anjali Nair", roles.strategist);
  ids.designer = await addPerson(db, "Vishnu Prasad", roles.designer);
  ids.zenith = await addClient(db, "Zenith IAS Academy", { members: [ids.strategist, ids.designer] });
  ids.bright = await addClient(db, "Brightpath Nursing College", { members: [] });
  ids.zp = newId();
  ids.bp = newId();
  await db.insert(s.projects).values([
    { id: ids.zp, clientId: ids.zenith, name: "Oct" },
    { id: ids.bp, clientId: ids.bright, name: "Launch" },
  ]);
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("automation rules", () => {
  it("in review → reviewer gets it, a tag, and a note; done → a follow-up task", async () => {
    expect((await rules.save(as("strategist"), rule("Review flow", { type: "status_changed", status: "in_review" }, { clientId: ids.zenith }, [
      { type: "assign", personId: ids.strategist },
      { type: "add_tag", tag: "Needs review" },
      { type: "notify", personId: ids.owner, message: "A Zenith task is ready for review" },
    ]))).ok).toBe(true);
    expect((await rules.save(as("strategist"), rule("Post after done", { type: "status_changed", status: "done" }, { projectId: ids.zp }, [{ type: "create_task", title: "Post it and share the link", days: 1, ownerId: null }]))).ok).toBe(true);

    const t = newId();
    await db.insert(s.tasks).values({ id: t, projectId: ids.zp, clientId: ids.zenith, title: "Reel", rank: "a0", ownerId: ids.designer, createdById: ids.strategist });
    expect((await tasks.move(as("designer"), { taskId: t, status: "in_review" })).ok).toBe(true);
    expect(await row(t)).toMatchObject({ ownerId: ids.strategist, tags: ["Needs review"], status: "in_review" });
    expect((await store.notifications.list(ids.owner, 5)).map((n) => n.title)).toEqual(["A Zenith task is ready for review"]);
    expect((await store.notifications.list(ids.strategist, 5)).map((n) => n.title)).toContain("A task was given to you");
    expect((await eventsFor(db, t)).map((e) => [e.action, e.actorId])).toEqual([
      ["task.status_changed", ids.designer],
      ["task.reassigned", null],
      ["task.tagged", null],
      ["task.automation_notified", null],
    ]);

    expect((await tasks.move(as("strategist"), { taskId: t, status: "done" })).ok).toBe(true);
    const followUp = await db.select().from(s.tasks).where(sql`${s.tasks.title} = 'Post it and share the link'`);
    expect(followUp).toHaveLength(1);
    expect(followUp[0]).toMatchObject({ projectId: ids.zp, ownerId: ids.strategist, dueDate: addDays(istDate(), 1) });
    const [r] = await db.select({ runs: s.automations.runs }).from(s.automations).where(sql`${s.automations.name} = 'Post after done'`);
    expect(r?.runs).toBe(1);
  });

  it("leaves other clients alone, never loops, and skips inactive rules", async () => {
    // Would loop if rule actions set off rules: tag → set status → (status rule) → tag…
    expect((await rules.save(as("owner"), rule("Rule A", { type: "tagged" }, {}, [{ type: "set_status", status: "blocked" }]))).ok).toBe(true);
    await rules.save(as("owner"), rule("Rule B", { type: "status_changed", status: "blocked" }, {}, [{ type: "add_tag", tag: "Stuck" }]));
    const t = newId();
    await db.insert(s.tasks).values({ id: t, projectId: ids.bp, clientId: ids.bright, title: "Brochure", rank: "a0", ownerId: ids.owner });
    expect((await tasks.setTags(as("owner"), { taskId: t, tags: ["Print"] })).ok).toBe(true);
    expect(await row(t)).toMatchObject({ status: "blocked", tags: ["Print"] });
    await rules.save(as("owner"), { ...rule("Rule A", { type: "tagged" }, {}, [{ type: "set_status", status: "blocked" }]), automationId: (await store.taskSetup.automations()).find((a) => a.name === "Rule A")!.id, active: "" });
    await tasks.move(as("owner"), { taskId: t, status: "todo" });
    await tasks.setTags(as("owner"), { taskId: t, tags: ["Print", "Two"] });
    expect((await row(t)).status).toBe("todo");
  });

  it("only leads set rules; a strategist must pick one of their clients", async () => {
    expect(await rules.save(as("designer"), rule("X", { type: "task_created" }, {}, [{ type: "add_tag", tag: "New" }]))).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(await rules.save(scopedLead(), rule("Tag new", { type: "task_created" }, {}, [{ type: "add_tag", tag: "New" }]))).toMatchObject({ ok: false, error: { code: "invalid", message: expect.stringContaining("Pick a client") } });
    expect(await rules.save(scopedLead(), rule("Tag new", { type: "task_created" }, { clientId: ids.bright }, [{ type: "add_tag", tag: "New" }]))).toMatchObject({ ok: false, error: { code: "invalid", message: "Pick one of your clients." } });
    expect(await rules.save(scopedLead(), rule("Tag new", { type: "task_created" }, { clientId: ids.zenith }, []))).toMatchObject({ ok: false, error: { message: "Add at least one action." } });
    const list = await rules.list(scopedLead());
    expect(list.ok && list.value.rules).toEqual([]);
  });

  it("keeps leads to their own clients' rules, and stops a rule whose author has left", async () => {
    const owners = await rules.save(as("owner"), rule("Owner rule", { type: "task_created" }, { clientId: ids.bright }, [{ type: "add_tag", tag: "New" }]));
    if (!owners.ok) throw new Error(owners.error.message);
    expect(await rules.save(scopedLead(), { ...rule("Hijack", { type: "task_created" }, { clientId: ids.zenith }, [{ type: "add_tag", tag: "x" }]), automationId: owners.value.id })).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(await rules.remove(scopedLead(), owners.value.id)).toMatchObject({ ok: false });

    const mine = await rules.save(scopedLead(), rule("Zenith new", { type: "task_created" }, { projectId: ids.zp }, [{ type: "add_tag", tag: "Fresh" }]));
    if (!mine.ok) throw new Error(mine.error.message);
    const stored = await store.taskSetup.findAutomation(mine.value.id);
    expect(stored?.conditions).toMatchObject({ clientId: ids.zenith, projectId: ids.zp });
    const first = await tasks.create(as("designer"), { projectId: ids.zp, title: "First" });
    if (!first.ok) throw new Error(first.error.message);
    expect((await row(first.value.id)).tags).toEqual(["Fresh"]);
    // The strategist leaves Oppllo: their rules stop.
    await db.execute(sql`update people set status = 'left' where id = ${ids.strategist}`);
    const second = await tasks.create(as("designer"), { projectId: ids.zp, title: "Second" });
    if (!second.ok) throw new Error(second.error.message);
    expect((await row(second.value.id)).tags).toEqual([]);
  });
});
