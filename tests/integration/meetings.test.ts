// Meetings library (Stage 13.4): seen like their page (clients, private spaces, 14.2 levels); action items with an
// @owner and a date become tasks only on Approve, through the task service's guards; weekly meetings get their next
// page with the open items; "what did we decide" stays inside what each person can see.
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { newId } from "@/lib/id";
import { createDocService } from "@/services/docs";
import { createMeetingService } from "@/services/meetings";
import { createTaskService } from "@/services/tasks";
import { actorOf, addClient, addPerson, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const clock = { today: () => "2026-10-21", now: () => new Date("2026-10-21T06:30:00Z") };
const docs = createDocService({ store, clock });
const tasks = createTaskService({ store, clock });
const meetings = createMeetingService({ store, clock, docs, tasks });

const ids = { owner: "", strategist: "", designer: "", marketer: "", intern: "", zenith: "", founder: "" };
const named = (id: string, roles: Parameters<typeof actorOf>[1], fullName: string) => ({ ...actorOf(id, roles), fullName });
const strategist = () => named(ids.strategist, ["strategist"], "Anjali Nair");
const designer = () => named(ids.designer, ["designer"], "Nikhil Das");
const marketer = () => named(ids.marketer, ["performance_marketer"], "Rahul Krishnan");
const intern = () => named(ids.intern, ["intern"], "Arun Babu");
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? "ok" : r.error!.code);
function value<T>(r: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}
const person = (id: string, name: string) => `@[${name}](person:${id})`;

/** Writes the meeting page's Decisions and Action items (as the team would in the editor). */
async function write(actor: ReturnType<typeof designer>, meetingId: string, decisions: string[], items: string[]) {
  const m = value(await meetings.get(actor, meetingId));
  const body = m.body.replace(/## Decisions[\s\S]*$/, `## Decisions\n\n${decisions.map((d) => `- ${d}`).join("\n")}\n\n## Action items\n\n${items.join("\n")}`);
  value(await docs.update(actor, { docId: m.docId, version: m.docVersion, title: m.title, body }));
}

beforeEach(async () => {
  await wipe(db);
  ids.owner = await addPerson(db, "Faisal Rahman", ["owner"]);
  ids.strategist = await addPerson(db, "Anjali Nair", ["strategist"]);
  ids.designer = await addPerson(db, "Nikhil Das", ["designer"]);
  ids.marketer = await addPerson(db, "Rahul Krishnan", ["performance_marketer"]);
  ids.intern = await addPerson(db, "Arun Babu", ["intern"]);
  ids.zenith = await addClient(db, "Zenith IAS Academy", { strategistId: ids.strategist, members: [ids.designer] });
  ids.founder = newId();
  await db.insert(s.clients).values({ id: ids.founder, name: "Founder office", isInternal: true, isPrivate: true, status: "active" });
  await db.insert(s.clientMembers).values([
    { clientId: ids.founder, personId: ids.designer, level: "edit" },
    { clientId: ids.founder, personId: ids.marketer, level: "view" },
  ]);
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("meetings", () => {
  it("are seen like their page; filters by client, kind, date and attendee", async () => {
    const z = value(await meetings.create(strategist(), { title: "Zenith weekly", clientId: ids.zenith, kind: "client_call", meetingDate: "2026-10-21", attendees: [ids.designer] }));
    value(await meetings.create(designer(), { title: "Founder sync", clientId: ids.founder, kind: "internal", meetingDate: "2026-10-20", attendees: [] }));
    value(await meetings.create(strategist(), { title: "Team review", kind: "review", meetingDate: "2026-10-01" }));
    const page = value(await docs.get(strategist(), z.docId));
    expect(page.body).toContain(`## Attendees\n\n- ${person(ids.designer, "Nikhil Das")}`);
    expect(page.body).toContain("## Action items");
    const titles = async (a: ReturnType<typeof designer>, f = {}) => (await meetings.list(a, f)).map((m) => m.title);
    expect(await titles(designer())).toEqual(["Zenith weekly", "Founder sync", "Team review"]);
    expect(await titles(strategist())).toEqual(["Zenith weekly", "Team review"]); // private space stays private
    expect(await titles(intern())).toEqual(["Team review"]);
    expect(await titles(designer(), { kind: "internal" })).toEqual(["Founder sync"]);
    expect(await titles(designer(), { clientId: ids.zenith })).toEqual(["Zenith weekly"]);
    expect(await titles(designer(), { clientId: null })).toEqual(["Team review"]);
    expect(await titles(designer(), { from: "2026-10-15", to: "2026-10-20" })).toEqual(["Founder sync"]);
    expect(await titles(designer(), { attendee: ids.designer })).toEqual(["Zenith weekly"]);
    expect(code(await meetings.get(intern(), z.id))).toBe("not_found");
    expect(code(await meetings.create(marketer(), { title: "x", clientId: ids.founder, kind: "internal", meetingDate: "2026-10-21" }))).toBe("forbidden"); // view level
    expect(code(await meetings.create(intern(), { title: "x", clientId: ids.founder, kind: "internal", meetingDate: "2026-10-21" }))).toBe("not_found");
  });

  it("action items become tasks only on Approve, through the task service's guards", async () => {
    const projectId = newId();
    await db.insert(s.projects).values({ id: projectId, clientId: ids.zenith, name: "Admissions 2027" });
    const m = value(await meetings.create(strategist(), { title: "Zenith weekly", clientId: ids.zenith, kind: "client_call", meetingDate: "2026-10-21" }));
    await write(strategist(), m.id, ["Budget stays at ₹50,000"], [`- [ ] ${person(ids.designer, "Nikhil Das")} send the media plan by Friday`, "- [ ] Ask about the brochure naale", `- [ ] ${person(ids.intern, "Arun Babu")} draft posts by 25 Oct`]);
    expect(Number((await db.execute<{ n: number }>(sql`select count(*)::int as n from tasks where title like '%media plan%'`))[0]!.n)).toBe(0); // nothing without Approve
    const d = value(await meetings.get(strategist(), m.id));
    expect(d.items.map((i) => [i.ownerId, i.due])).toEqual([
      [ids.designer, "2026-10-23"],
      [null, "2026-10-22"],
      [ids.intern, "2026-10-26"], // 25 Oct is a Sunday → Monday
    ]);
    const { taskId } = value(await meetings.approve(strategist(), { meetingId: m.id, itemKey: d.items[0]!.key, projectId }));
    const [t] = await db.execute<{ title: string; owner_id: string; due_date: string }>(sql`select title, owner_id, due_date::text from tasks where id = ${taskId}`);
    expect([t!.title, t!.owner_id, t!.due_date]).toEqual(["send the media plan", ids.designer, "2026-10-23"]);
    expect(code(await meetings.approve(strategist(), { meetingId: m.id, itemKey: d.items[0]!.key, projectId }))).toBe("invalid"); // once only
    expect(value(await meetings.get(designer(), m.id)).items[0]!.taskId).toBe(taskId);
    expect(code(await meetings.approve(intern(), { meetingId: m.id, itemKey: d.items[1]!.key, projectId }))).toBe("not_found");
    const ev = await db.execute<{ action: string }>(sql`select action from events where entity_type = 'meeting' order by occurred_at`);
    expect(ev.map((e) => e.action)).toEqual(["meeting.created", "meeting.action_approved"]);
    // The task service's guards in a private space: view level can't add tasks; an owner outside the space is refused.
    const spaceProject = newId();
    await db.insert(s.projects).values({ id: spaceProject, clientId: ids.founder, name: "Hiring" });
    const f = value(await meetings.create(designer(), { title: "Founder sync", clientId: ids.founder, kind: "internal", meetingDate: "2026-10-21" }));
    await write(designer(), f.id, [], [`- [ ] ${person(ids.strategist, "Anjali Nair")} check references by Friday`, "- [ ] Post the job naale"]);
    const fi = value(await meetings.get(designer(), f.id)).items;
    expect(code(await meetings.approve(marketer(), { meetingId: f.id, itemKey: fi[1]!.key, projectId: spaceProject }))).toBe("forbidden");
    expect(code(await meetings.approve(designer(), { meetingId: f.id, itemKey: fi[0]!.key, projectId: spaceProject }))).toBe("invalid");
    expect(code(await meetings.approve(designer(), { meetingId: f.id, itemKey: fi[1]!.key, projectId: spaceProject }))).toBe("ok");
  });

  it("a weekly meeting gets its next page the day after, with the open items; once only", async () => {
    const m = value(await meetings.create(strategist(), { title: "Zenith weekly", clientId: ids.zenith, kind: "client_call", meetingDate: "2026-10-14", attendees: [ids.designer], repeat: "weekly" }));
    await write(strategist(), m.id, [], [`- [ ] ${person(ids.designer, "Nikhil Das")} send the media plan by Friday`, "- [x] Book the hall"]);
    value(await meetings.create(strategist(), { title: "Today's", kind: "internal", meetingDate: "2026-10-21", repeat: "weekly" })); // not held yet
    expect(await meetings.runDaily()).toEqual({ meetings: 1, errors: [] });
    expect(await meetings.runDaily()).toEqual({ meetings: 0, errors: [] });
    const prev = value(await meetings.get(strategist(), m.id));
    const next = value(await meetings.get(designer(), prev.nextId!));
    expect([next.meetingDate, next.previousId, next.repeat, next.attendees]).toEqual(["2026-10-21", m.id, "weekly", [ids.designer]]);
    expect(next.items.map((i) => [i.text, i.ownerId])).toEqual([["@Nikhil Das send the media plan by Friday", ids.designer]]);
  });

  it("decisions stay inside what each person can see, and are searchable", async () => {
    const z = value(await meetings.create(strategist(), { title: "Zenith weekly", clientId: ids.zenith, kind: "client_call", meetingDate: "2026-10-21" }));
    await write(strategist(), z.id, ["Budget stays at ₹50,000", "Launch on 1 Nov"], []);
    const f = value(await meetings.create(designer(), { title: "Founder sync", clientId: ids.founder, kind: "internal", meetingDate: "2026-10-20" }));
    await write(designer(), f.id, ["Hire a video editor"], []);
    expect((await meetings.decisions(designer())).map((d) => d.text)).toEqual(["Budget stays at ₹50,000", "Launch on 1 Nov", "Hire a video editor"]);
    expect((await meetings.decisions(strategist())).map((d) => d.text)).toEqual(["Budget stays at ₹50,000", "Launch on 1 Nov"]);
    expect((await meetings.decisions(designer(), { clientId: ids.zenith, q: "budget" })).map((d) => [d.text, d.clientName])).toEqual([["Budget stays at ₹50,000", "Zenith IAS Academy"]]);
    expect(await meetings.decisions(intern())).toEqual([]);
  });
});
