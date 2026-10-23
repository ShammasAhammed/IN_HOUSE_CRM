// Access to spaces (Stage 14.2): asked by the owner or HR, approved by the other one, confirmed by the member before
// anything opens; sensitive spaces need both; access ends on its day, in one step, or on leaving; only confirmed,
// unexpired members count anywhere (two private spaces).
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { newId } from "@/lib/id";
import { createDocService } from "@/services/docs";
import { createPeopleService } from "@/services/people";
import { createSpaceAccessService } from "@/services/space-access";
import { createSpaceService } from "@/services/spaces";
import { createTaskService } from "@/services/tasks";
import { actorOf, addPerson, addProjectWithTask, eventsFor, fixedClock, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const clock = fixedClock("2026-10-21");
const access = createSpaceAccessService({ store, clock });
const spaces = createSpaceService({ store, clock });
const tasks = createTaskService({ store, clock });
const people = createPeopleService({ store, clock });
const docs = createDocService({ store, clock });

const ids = { owner: "", hr: "", hr2: "", strategist: "", designer: "", founder: "", finance: "", sales: "", taskA: "", projectA: "" };
const owner = () => actorOf(ids.owner, ["owner"]);
const hr = () => actorOf(ids.hr, ["hr"]);
const hr2 = () => actorOf(ids.hr2, ["hr"]);
const strategist = () => actorOf(ids.strategist, ["strategist"]);
const designer = () => actorOf(ids.designer, ["designer"]);

async function addSpace(name: string, isPrivate: boolean) {
  const id = newId();
  await db.insert(s.clients).values({ id, name, isInternal: true, isPrivate, status: "active" });
  return id;
}
const ask = (by: ReturnType<typeof owner>, spaceId: string, personId: string, extra: Record<string, string> = {}) =>
  access.ask(by, { spaceId, personId, level: "edit", reason: "Helps with the founder work", twoStep: "yes", ...extra });
const idOf = (r: Awaited<ReturnType<typeof access.ask>>) => {
  if (!r.ok) throw new Error(r.error.message);
  return r.value.id;
};
const notes = async (personId: string) => (await db.execute<{ kind: string; title: string; body: string | null }>(sql`select kind, title, body from notifications where person_id = ${personId} order by created_at`)).map((n) => n);

beforeEach(async () => {
  await wipe(db);
  ids.owner = await addPerson(db, "Faisal Rahman", ["owner"]);
  ids.hr = await addPerson(db, "Divya Suresh", ["hr"]);
  ids.hr2 = await addPerson(db, "Meera Pillai", ["hr"]);
  ids.strategist = await addPerson(db, "Anjali Nair", ["strategist"]);
  ids.designer = await addPerson(db, "Nikhil Das", ["designer"]);
  ids.founder = await addSpace("Founder office", true);
  ids.finance = await addSpace("Finance", true);
  ids.sales = await addSpace("Sales", false);
  const t = await addProjectWithTask(db, ids.founder, { ownerId: ids.owner });
  ids.taskA = t.taskId;
  ids.projectA = t.projectId;
  await db.execute(sql`update tasks set title = 'Secret founder plan', rank = 'a0' where id = ${ids.taskA}`);
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("asking, approving, and 'I understand'", () => {
  it("previews in plain words, needs the other of owner/HR, tells the member, and opens only on confirmation", async () => {
    const p = await access.preview(hr(), { spaceId: ids.founder, personId: ids.strategist, level: "comment", expiresOn: "2026-12-31" });
    expect(p.ok && p.value.text).toMatch(/^Anjali Nair will be able to see the space's projects, tasks, docs and files; comment on tasks, mention people and watch tasks in Founder office, until 31 Dec 2026\. Anjali Nair will not be able to create and change tasks/);
    expect(p.ok && p.value.sensitive).toBe(true);
    const missing2Step = await ask(hr(), ids.founder, ids.strategist, { twoStep: "" });
    expect(missing2Step.ok ? null : missing2Step.error.fieldErrors?.twoStep).toEqual(["Pick yes or not sure."]);
    const id = idOf(await ask(hr(), ids.founder, ids.strategist, { level: "comment", expiresOn: "2026-12-31" }));
    expect((await notes(ids.owner)).map((n) => n.title)).toEqual(["Access to approve: Anjali Nair in Founder office (comment)"]);
    const again = await ask(hr2(), ids.founder, ids.strategist);
    expect(again.ok ? "ok" : again.error.code).toBe("conflict");

    expect((await access.decide(owner(), { requestId: id, decision: "approve" })).ok).toBe(true);
    const msg = (await notes(ids.strategist)).find((n) => n.kind === "space.access_granted");
    expect(msg?.body).toMatch(/^You can now see the space's projects.*until 31 Dec 2026\. You cannot create and change tasks.*Asked by Divya Suresh, approved by Faisal Rahman\. Why: Helps with the founder work/);
    // Approved, not yet confirmed: still outside.
    expect((await tasks.get(strategist(), ids.taskA)).ok).toBe(false);
    const mine = await access.mine(strategist());
    expect(mine.toConfirm).toHaveLength(1);
    expect((await access.confirm(designer(), id)).ok).toBe(false);
    expect((await access.confirm(strategist(), id)).ok).toBe(true);
    expect((await tasks.get(strategist(), ids.taskA)).ok).toBe(true);
    const after = await access.mine(strategist());
    expect(after).toMatchObject({ toConfirm: [], spaces: [{ name: "Founder office", level: "comment", levelLabel: "Comment", expiresOn: "2026-12-31" }] });
    expect((await eventsFor(db, id)).map((e) => e.action)).toEqual(["space.access_requested", "space.access_approved", "space.access_confirmed"]);
  });

  it("refuses self-approval, needs owner and HR for sensitive spaces, and two people for the rest", async () => {
    const own = idOf(await ask(hr(), ids.sales, ids.designer));
    const self = await access.decide(hr(), { requestId: own, decision: "approve" });
    expect(self.ok ? null : self.error.message).toMatch(/Nobody approves their own request/);
    expect((await access.decide(hr2(), { requestId: own, decision: "approve" })).ok).toBe(true);

    const sensitive = idOf(await ask(hr(), ids.finance, ids.designer));
    const hrHr = await access.decide(hr2(), { requestId: sensitive, decision: "approve" });
    expect(hrHr.ok ? null : hrHr.error.message).toMatch(/owner and HR both take part/);
    expect((await access.decide(owner(), { requestId: sensitive, decision: "approve" })).ok).toBe(true);

    const byOwner = idOf(await ask(owner(), ids.founder, ids.designer));
    expect((await access.decide(owner(), { requestId: byOwner, decision: "approve" })).ok).toBe(false);
    const noNote = await access.decide(hr(), { requestId: byOwner, decision: "refuse" });
    expect(noNote.ok ? null : noNote.error.fieldErrors?.note).toEqual(["Say why."]);
    expect((await access.decide(hr(), { requestId: byOwner, decision: "refuse", note: "Not needed now" })).ok).toBe(true);
    expect((await notes(ids.owner)).map((n) => n.title)).toContain("Refused: Nikhil Das in Founder office");
    expect((await access.decide(designer(), { requestId: byOwner, decision: "approve" })).ok).toBe(false);
  });

  it("lets the owner approve alone when there is no HR person, and says so", async () => {
    await db.execute(sql`update people set status = 'left' where id in (${ids.hr}, ${ids.hr2})`);
    const id = idOf(await ask(owner(), ids.founder, ids.designer));
    expect((await access.decide(owner(), { requestId: id, decision: "approve" })).ok).toBe(true);
    const [ev] = await db.execute<{ data: { ownerAlone: boolean } }>(sql`select data from events where action = 'space.access_approved'`);
    expect(ev?.data.ownerAlone).toBe(true);
    expect((await access.mine(designer())).toConfirm[0]?.message).toMatch(/approved by Faisal Rahman alone \(there is no HR person\)/);
  });

  it("lets a space's manager ask for others there, never approve or make it private", async () => {
    const id = idOf(await ask(hr(), ids.sales, ids.strategist, { level: "manage" }));
    await access.decide(owner(), { requestId: id, decision: "approve" });
    await access.confirm(strategist(), id);
    const theirAsk = await ask(strategist(), ids.sales, ids.designer, { level: "view" });
    expect(theirAsk.ok).toBe(true);
    expect((await access.decide(strategist(), { requestId: idOf(theirAsk), decision: "approve" })).ok).toBe(false);
    expect((await ask(strategist(), ids.founder, ids.designer)).ok).toBe(false);
    expect((await spaces.update(strategist(), { spaceId: ids.sales, name: "Sales team", isPrivate: "", isSensitive: "", archived: "" })).ok).toBe(true);
    expect((await spaces.update(strategist(), { spaceId: ids.sales, name: "Sales team", isPrivate: "on", isSensitive: "", archived: "" })).ok).toBe(false);
  });
});

describe("only confirmed, unexpired members count", () => {
  it("for the space guard: approved-but-unconfirmed and expired members can't be put on work or told about it", async () => {
    const id = idOf(await ask(hr(), ids.founder, ids.designer));
    await access.decide(owner(), { requestId: id, decision: "approve" });
    const before = await tasks.create(owner(), { projectId: ids.projectA, title: "Board pack", ownerId: ids.designer });
    expect(before.ok).toBe(false);
    await access.confirm(designer(), id);
    expect((await tasks.create(owner(), { projectId: ids.projectA, title: "Board pack", ownerId: ids.designer })).ok).toBe(true);
    // Past its last day (before the nightly job removes it): no longer a member anywhere.
    await db.execute(sql`update client_members set expires_on = '2020-01-01' where client_id = ${ids.founder} and person_id = ${ids.designer}`);
    expect((await tasks.get(designer(), ids.taskA)).ok).toBe(false);
    expect((await tasks.create(owner(), { projectId: ids.projectA, title: "Board pack 2", ownerId: ids.designer })).ok).toBe(false);
    // Membership in one private space opens nothing in the other.
    expect((await tasks.table(designer())).ok).toBe(true);
    expect(await store.clients.hiddenSpaces(ids.designer)).toEqual(expect.arrayContaining([ids.founder, ids.finance]));
  });

  it("members from before approvals (14.1) keep access at edit", async () => {
    await db.insert(s.clientMembers).values({ clientId: ids.founder, personId: ids.designer });
    expect(await store.clients.listMembers(ids.founder)).toMatchObject([{ personId: ids.designer, level: "edit", expiresOn: null }]);
    expect((await tasks.get(designer(), ids.taskA)).ok).toBe(true);
  });
});

describe("ending access", () => {
  it("removal is one step, instant, by the owner or HR, and the member is told", async () => {
    const id = idOf(await ask(hr(), ids.founder, ids.designer));
    await access.decide(owner(), { requestId: id, decision: "approve" });
    await access.confirm(designer(), id);
    expect((await access.remove(designer(), { spaceId: ids.founder, personId: ids.designer })).ok).toBe(false);
    expect((await access.remove(hr(), { spaceId: ids.founder, personId: ids.designer, note: "Project over" })).ok).toBe(true);
    expect((await tasks.get(designer(), ids.taskA)).ok).toBe(false);
    expect((await notes(ids.designer)).map((n) => n.title)).toContain("Your access to Founder office was removed");
  });

  it("access ends on its day by the nightly job, with a week's warning to the owner and HR", async () => {
    const soon = idOf(await ask(hr(), ids.sales, ids.designer, { expiresOn: "2026-10-25" }));
    await access.decide(owner(), { requestId: soon, decision: "approve" });
    await access.confirm(designer(), soon);
    const old = idOf(await ask(hr(), ids.founder, ids.strategist, { expiresOn: "2026-10-30" }));
    await access.decide(owner(), { requestId: old, decision: "approve" });
    await access.confirm(strategist(), old);
    await db.execute(sql`update client_members set expires_on = '2026-10-20' where client_id = ${ids.founder}`);
    const r = await access.runDaily();
    expect(r).toMatchObject({ expired: 1, warned: 1 });
    expect(await store.clients.listMembers(ids.founder)).toEqual([]);
    expect((await notes(ids.strategist)).map((n) => n.title)).toContain("Your access to Founder office has ended");
    expect((await notes(ids.hr)).map((n) => n.title)).toContain("Nikhil Das's access to Sales ends 25 Oct 2026");
    await access.runDaily();
    expect((await notes(ids.hr)).filter((n) => n.kind === "space.access_ending")).toHaveLength(1);
  });

  it("leaving the company removes every space access and open request", async () => {
    const id = idOf(await ask(hr(), ids.founder, ids.designer));
    await access.decide(owner(), { requestId: id, decision: "approve" });
    await access.confirm(designer(), id);
    const pending = idOf(await ask(hr(), ids.sales, ids.designer));
    expect((await people.markLeft(hr(), { personId: ids.designer, endDate: "2026-10-21" })).ok).toBe(true);
    expect(await store.clients.spaceMembershipsOf(ids.designer)).toEqual([]);
    expect((await store.spaceAccess.find(pending))?.status).toBe("cancelled");
  });

  it("the owner reviews members every 90 days; the nightly job says when it's due", async () => {
    await db.insert(s.clientMembers).values({ clientId: ids.founder, personId: ids.designer });
    const admin = await access.admin(owner());
    expect(admin.ok && admin.value.review).toMatchObject([{ name: "Founder office", due: true, members: [{ fullName: "Nikhil Das", level: "edit" }] }]);
    expect((await access.runDaily()).reviewsDue).toBe(1);
    expect((await notes(ids.owner)).map((n) => n.title)).toContain("Review who is in Founder office");
    expect((await access.markReviewed(hr(), ids.founder)).ok).toBe(false);
    expect((await access.markReviewed(owner(), ids.founder)).ok).toBe(true);
    expect((await access.runDaily()).reviewsDue).toBe(0);
  });
});

describe("levels limit what members do inside a space (D-14.2a)", () => {
  async function member(personId: string, roles: Parameters<typeof actorOf>[1], level: string) {
    const id = idOf(await ask(hr(), ids.founder, personId, { level }));
    await access.decide(owner(), { requestId: id, decision: "approve" });
    await access.confirm(actorOf(personId, roles), id);
  }

  it("view reads only, even for a strategist whose role edits everywhere; comment adds comments; edit does the work", async () => {
    await member(ids.strategist, ["strategist"], "view");
    const st = strategist();
    expect((await tasks.get(st, ids.taskA)).ok).toBe(true);
    for (const r of [
      await tasks.comment(st, { taskId: ids.taskA, body: "Looks good" }),
      await tasks.update(st, { taskId: ids.taskA, title: "Changed" }),
      await tasks.create(st, { projectId: ids.projectA, title: "New one" }),
      await tasks.logTime(st, { taskId: ids.taskA, minutes: "30" }),
      await docs.create(st, { title: "Founder memo", body: "", clientId: ids.founder }),
    ])
      expect(r.ok ? "ok" : r.error.message).toMatch(/Your access to this space is "View"/);

    await member(ids.designer, ["designer"], "comment");
    const d = designer();
    expect((await tasks.comment(d, { taskId: ids.taskA, body: "One thought" })).ok).toBe(true);
    const upd = await tasks.update(d, { taskId: ids.taskA, title: "Changed by designer" });
    expect(upd.ok).toBe(false);

    // Raised to edit: the work opens up.
    await access.remove(hr(), { spaceId: ids.founder, personId: ids.strategist });
    await member(ids.strategist, ["strategist"], "edit");
    expect((await tasks.update(st, { taskId: ids.taskA, title: "Secret founder plan v2" })).ok).toBe(true);
    expect((await docs.create(st, { title: "Founder memo", body: "", clientId: ids.founder })).ok).toBe(true);
  });
});
