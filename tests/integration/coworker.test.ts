// The AI co-worker (Stage 12.5), against the database: cards posted in the right chat and nowhere else, approval only
// by someone allowed and through the guards, Change, Dismiss's 7-day quiet, snooze wake-ups, learning, Approve all with
// a failure, the Monday digest (hours for the owner only), weekly setup nudges, the calendar gap, switches and the cap,
// nothing changed without approval, and no AI key needed.
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { newId } from "@/lib/id";
import type { AiModel, AiRequest, AiResult, FileStorage } from "@/repositories";
import { createAiService } from "@/services/ai";
import { createCapacityService } from "@/services/capacity";
import { createChatService } from "@/services/chat";
import { createClientService } from "@/services/clients";
import { createCoworkerService } from "@/services/coworker";
import { createResultService } from "@/services/results";
import { createTaskService } from "@/services/tasks";
import { actorOf, addClient, addPerson, addProjectWithTask, addRetainer, addService, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
let today = "2026-10-21";
const clock = { today: () => today, now: () => new Date(`${today}T06:30:00Z`) };

function fake(reply: string): AiModel & { asked: AiRequest[] } {
  const asked: AiRequest[] = [];
  return {
    connected: true,
    provider: "openai",
    model: "gpt-5-nano",
    asked,
    async answer(req): Promise<AiResult> {
      asked.push(req);
      return { kind: "answer", outcome: "answered", text: reply, toolCalls: [], usage: [{ model: "gpt-5-nano", inputTokens: 100, outputTokens: 20, cacheWriteTokens: 0, cacheReadTokens: 0, costMicroUsd: 1000 }] };
    },
  };
}

function build(models: AiModel[] = []) {
  const ai = createAiService({ store, clock, models, inrPerUsd: 90 });
  const chat = createChatService({ store, clock, storage: {} as FileStorage });
  const tasks = createTaskService({ store, clock });
  const coworker = createCoworkerService({
    store,
    clock,
    ai,
    chat,
    tasks,
    capacity: createCapacityService({ store, clock }),
    results: createResultService({ store, clock, ads: { forClient: async () => ({ ok: true, value: { state: "not_connected" } }) } }),
    clients: createClientService({ store, clock }),
  });
  return { coworker, chat };
}

const ids = { owner: "", strategist: "", designer: "", accountant: "", zenith: "", founder: "", zenithProject: "", late: "", secret: "" };
const named = (id: string, roles: Parameters<typeof actorOf>[1], fullName: string) => ({ ...actorOf(id, roles), fullName });
const owner = () => named(ids.owner, ["owner"], "Faisal Rahman");
const strategist = () => named(ids.strategist, ["strategist"], "Anjali Nair");
const accountant = () => named(ids.accountant, ["accountant"], "Lekha Menon");
const cardsIn = async (clientId: string) => db.execute<{ id: string; kind: string; status: string; keys: string[]; channel_id: string; wording: string | null }>(sql`select id, kind, status, keys, channel_id, wording from coworker_suggestions where client_id = ${clientId} order by created_at`);
const dueOf = async (taskId: string) => (await db.execute<{ due_date: string }>(sql`select due_date from tasks where id = ${taskId}`))[0]!.due_date;
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? "ok" : r.error!.code);

beforeEach(async () => {
  await wipe(db);
  today = "2026-10-21";
  ids.owner = await addPerson(db, "Faisal Rahman", ["owner"]);
  ids.strategist = await addPerson(db, "Anjali Nair", ["strategist"]);
  ids.designer = await addPerson(db, "Nikhil Das", ["designer"]);
  ids.accountant = await addPerson(db, "Lekha Menon", ["accountant"]);
  ids.zenith = await addClient(db, "Zenith IAS Academy", { strategistId: ids.strategist, members: [ids.designer] });
  const zp = await addProjectWithTask(db, ids.zenith, { ownerId: ids.designer, dueDate: "2026-10-16" });
  ids.zenithProject = zp.projectId;
  ids.late = zp.taskId;
  ids.founder = newId();
  await db.insert(s.clients).values({ id: ids.founder, name: "Founder office", isInternal: true, isPrivate: true, status: "active" });
  await db.insert(s.clientMembers).values({ clientId: ids.founder, personId: ids.designer, level: "edit" });
  ids.secret = (await addProjectWithTask(db, ids.founder, { ownerId: ids.designer, dueDate: "2026-10-15" })).taskId;
  await db.update(s.tasks).set({ title: "Secret fundraise deck" }).where(sql`id = ${ids.secret}`);
  await db.update(s.tasks).set({ title: "Open day poster" }).where(sql`id = ${ids.late}`);
  await db.update(s.tasks).set({ rank: "a0" });
  await db.update(s.projects).set({ status: "active" });
  // Something happened today on both, so neither is a "quiet client".
  for (const c of [ids.zenith, ids.founder]) await db.insert(s.events).values({ id: newId(), actorId: ids.owner, action: "client.updated", entityType: "client", entityId: c, clientId: c, data: {} });
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("cards", () => {
  it("are posted in the right chat, as a suggestion only: nothing changes and a private space's card stays in it", async () => {
    const { coworker, chat } = build();
    const r = await coworker.runDaily();
    expect(r.posted).toBeGreaterThanOrEqual(2);
    expect(await dueOf(ids.late)).toBe("2026-10-16");
    const [z] = await cardsIn(ids.zenith);
    const [f] = await cardsIn(ids.founder);
    expect([z!.kind, f!.kind]).toEqual(["overdue", "overdue"]);
    expect(z!.wording).toBeNull(); // no AI key: the rules' own words
    expect(Object.keys(await coworker.cards(strategist(), z!.channel_id))).toEqual([z!.id]);
    expect(await coworker.cards(strategist(), f!.channel_id)).toEqual({});
    expect(code(await coworker.approve(strategist(), { id: f!.id }))).toBe("not_found");
    const messages = await db.execute<{ coworker_id: string | null; channel_id: string }>(sql`select coworker_id, channel_id from chat_messages where coworker_id is not null`);
    expect(messages.map((m) => m.channel_id).sort()).toEqual([z!.channel_id, f!.channel_id].sort());
    expect(code(await chat.conversation(strategist(), f!.channel_id))).toBe("not_found");
  });

  it("are approved only by someone who could make the change, through the task rules, and Change edits first", async () => {
    const { coworker } = build();
    await coworker.runDaily();
    const [z] = await cardsIn(ids.zenith);
    // The accountant sees the client, but can't change its tasks: nothing happens and the card stays open.
    const tried = await coworker.approve(accountant(), { id: z!.id });
    expect(tried.ok && [tried.value.status, tried.value.results?.[0]?.ok]).toEqual(["open", false]);
    expect(await dueOf(ids.late)).toBe("2026-10-16");
    // Change: only the date, never which task.
    const card = (await coworker.cards(strategist(), z!.channel_id))[z!.id]!;
    const wrongTask = card.actions.map((a) => ({ ...a, taskId: ids.secret }));
    expect(code(await coworker.approve(strategist(), { id: z!.id, actions: wrongTask }))).toBe("invalid");
    const r = await coworker.approve(strategist(), { id: z!.id, actions: card.actions.map((a) => ({ ...a, date: "2026-10-28" })) });
    expect(r.ok && r.value.status).toBe("approved");
    expect(await dueOf(ids.late)).toBe("2026-10-28");
    expect(code(await coworker.dismiss(strategist(), z!.id))).toBe("conflict");
    expect((await db.execute<{ action: string }>(sql`select action from events where entity_type = 'coworker_suggestion' and entity_id = ${z!.id} order by occurred_at, id`)).map((e) => e.action)).toEqual(["coworker.suggested", "coworker.approve_failed", "coworker.changed", "coworker.approved"]);
  });

  it("Approve all goes through each change and reports the one that fails", async () => {
    const { coworker } = build();
    await coworker.runDaily();
    const [z] = await cardsIn(ids.zenith);
    const id = newId();
    await store.coworker.add({ id, clientId: ids.zenith, channelId: z!.channel_id, kind: "overdue", keys: ["x:1"], title: "2 late", why: ["a", "b"], actions: [{ type: "move_date", taskId: ids.late, taskTitle: "Open day poster", date: "2026-10-30" }, { type: "move_date", taskId: ids.secret, taskTitle: "Secret fundraise deck", date: "2026-10-30" }], wording: null, day: today }, clock.now());
    const r = await coworker.approve(strategist(), { id });
    expect(r.ok && [r.value.status, r.value.results?.map((x) => x.ok)]).toEqual(["partly", [true, false]]);
    expect([await dueOf(ids.late), await dueOf(ids.secret)]).toEqual(["2026-10-30", "2026-10-15"]);
  });

  it("dismissed ones stay quiet for 7 days; snoozed ones wake on the day or when the client replies", async () => {
    const { coworker } = build();
    await coworker.runDaily();
    const [z] = await cardsIn(ids.zenith);
    await coworker.dismiss(strategist(), z!.id);
    today = "2026-10-22";
    await coworker.runDaily();
    expect((await cardsIn(ids.zenith)).filter((c) => c.kind === "overdue")).toHaveLength(1);
    today = "2026-10-29";
    await coworker.runDaily();
    const again = (await cardsIn(ids.zenith)).filter((c) => c.kind === "overdue");
    expect(again.map((c) => c.status)).toEqual(["dismissed", "open"]);
    // Snooze until Monday (2 Nov), and until the client replies.
    await coworker.snooze(strategist(), { id: again[1]!.id, until: "monday" });
    today = "2026-10-30";
    expect((await coworker.runDaily()).woke).toBe(0);
    today = "2026-11-02";
    expect((await coworker.runDaily()).woke).toBe(1);
    await coworker.snooze(strategist(), { id: again[1]!.id, until: "client_reply" });
    today = "2026-11-03";
    expect((await coworker.runDaily()).woke).toBe(0);
    const [contact] = await db.execute<{ id: string }>(sql`select id from client_contacts where client_id = ${ids.zenith}`);
    const portalUser = newId();
    await db.insert(s.portalUsers).values({ id: portalUser, clientId: ids.zenith, contactId: contact!.id, email: "director@client.example", invitedById: ids.owner });
    const asset = newId();
    const version = newId();
    await db.insert(s.assets).values({ id: asset, clientId: ids.zenith, title: "Reel", kind: "video", approvalState: "client_review", currentVersion: 1, createdById: ids.designer });
    await db.insert(s.assetVersions).values({ id: version, assetId: asset, version: 1, storageProvider: "postgres", storageLocation: "x", storageFileId: newId(), fileName: "r.mp4", uploadedById: ids.designer });
    await db.insert(s.assetComments).values({ id: newId(), assetId: asset, versionId: version, portalUserId: portalUser, body: "Can you make it shorter?", createdAt: new Date("2026-11-03T08:00:00Z") });
    today = "2026-11-04";
    expect((await coworker.runDaily()).woke).toBe(1);
  });

  it("learns: a kind dismissed eight of the last ten times goes quiet for that client, and says so", async () => {
    const { coworker } = build();
    await coworker.runDaily();
    const [z] = await cardsIn(ids.zenith);
    await db.execute(sql`delete from coworker_suggestions`);
    for (let i = 0; i < 10; i++) await store.coworker.add({ id: newId(), clientId: ids.zenith, channelId: z!.channel_id, kind: "overdue", keys: [`old:${i}`], title: "old", why: [], actions: [], wording: null, day: "2026-10-01" }, new Date(`2026-10-0${(i % 9) + 1}T06:00:00Z`));
    await db.execute(sql`update coworker_suggestions set status = case when keys[1] in ('old:0', 'old:1') then 'approved' else 'dismissed' end, decided_at = created_at`);
    today = "2026-10-22";
    await coworker.runDaily();
    expect((await cardsIn(ids.zenith)).filter((c) => c.status === "open")).toEqual([]);
    expect((await db.execute<{ body: string }>(sql`select body from chat_messages where coworker_id is null and body like '%stop suggesting%'`)).length).toBe(1);
    const page = await coworker.page(owner());
    expect(page.ok && Object.keys(page.value.settings.quiet ?? {})).toEqual([`${ids.zenith}:overdue`]);
    expect(page.ok && page.value.rates.find((r) => r.kind === "overdue")).toMatchObject({ approved: 2, dismissed: 8 });
  });
});

describe("the rest of the co-worker", () => {
  it("never puts hours budgets in a chat card: results-behind cards show results only", async () => {
    const { resultsOnly } = await import("@/services/coworker");
    expect(resultsOnly({ level: "at_risk", reasons: ["Retainer hours at 120% of budget"] })).toBeNull();
    expect(resultsOnly({ level: "off_track", reasons: ["Leads 10 of 60", "Retainer hours at 120% of budget"] })).toEqual({ level: "off_track", reasons: ["Leads 10 of 60"] });
    expect(resultsOnly({ level: "on_track", reasons: [] })).toBeNull();
    const service = await addService(db);
    await addRetainer(db, ids.zenith, service, { feePaise: 4_500_000, budgetMinutes: 30, periodStart: "2026-10-01", periodEnd: "2026-10-31" });
    await db.insert(s.timeEntries).values({ id: newId(), taskId: ids.late, personId: ids.designer, clientId: ids.zenith, engagementId: null, minutes: 600, workDate: "2026-10-05", billable: true });
    const { coworker } = build();
    await coworker.runDaily();
    const rows = await db.execute<{ kind: string; why: unknown; actions: unknown }>(sql`select kind, why, actions from coworker_suggestions where client_id = ${ids.zenith}`);
    expect(rows.map((r) => r.kind)).not.toContain("results_behind");
    expect(JSON.stringify(rows)).not.toMatch(/Retainer hours|budget/i);
  });

  it("Mondays: the owner's client health digest, with hours only for the owner", async () => {
    const service = await addService(db);
    await addRetainer(db, ids.zenith, service, { feePaise: 4_500_000, budgetMinutes: 600, periodStart: "2026-10-01", periodEnd: "2026-10-31" });
    const { coworker } = build();
    today = "2026-10-26";
    expect((await coworker.runDaily()).digest).toBe(1);
    const lines = await coworker.digest(owner());
    expect(lines).toEqual([expect.objectContaining({ clientName: "Zenith IAS Academy", light: "🟡", text: expect.stringMatching(/hours \d+% · 1 late · last activity/) })]);
    expect(await coworker.digest(strategist())).toBeNull();
    expect((await db.execute<{ person_id: string }>(sql`select person_id from notifications where kind = 'coworker.digest'`)).map((n) => n.person_id)).toEqual([ids.owner]);
  });

  it("nudges the lead strategist about missing setup at most once a week", async () => {
    const { coworker } = build();
    await coworker.runDaily();
    today = "2026-10-22";
    await coworker.runDaily();
    const nudges = await db.execute<{ person_id: string; body: string }>(sql`select person_id, body from notifications where kind = 'coworker.setup'`);
    expect(nudges.map((n) => n.person_id)).toEqual([ids.strategist]);
    expect(nudges[0]!.body).toMatch(/no lead target this month, an empty knowledge base, no ad account linked/);
    today = "2026-10-27";
    await coworker.runDaily();
    expect((await db.execute(sql`select 1 from notifications where kind = 'coworker.setup'`)).length).toBe(2);
  });

  it("suggests planning tasks for a content calendar gap, created only on approval", async () => {
    await db.update(s.tasks).set({ dueDate: "2026-10-30" });
    for (const d of ["2026-09-29", "2026-10-01", "2026-10-06", "2026-10-08", "2026-10-13", "2026-10-15", "2026-10-20", "2026-10-22"]) await db.insert(s.contentItems).values({ id: newId(), clientId: ids.zenith, title: "Post", channel: "instagram_post", publishOn: d });
    const { coworker } = build();
    await coworker.runDaily();
    const gap = (await cardsIn(ids.zenith)).find((c) => c.kind === "calendar_gap")!;
    const before = Number((await db.execute<{ n: number }>(sql`select count(*)::int as n from tasks`))[0]!.n);
    const r = await coworker.approve(strategist(), { id: gap.id });
    expect(r.ok && r.value.status).toBe("approved");
    expect(Number((await db.execute<{ n: number }>(sql`select count(*)::int as n from tasks`))[0]!.n)).toBe(before + 2);
  });

  it("follows the owner's switches and the co-worker's own cap; the AI only rewords", async () => {
    const model = fake('{"cards":[{"i":0,"text":"Open day poster is late. Move it to Friday?"}]}');
    const { coworker } = build([model]);
    expect(code(await coworker.set(strategist(), { op: "on" }))).toBe("forbidden");
    await coworker.set(owner(), { op: "kind", kind: "overdue" });
    expect((await coworker.runDaily()).posted).toBe(0);
    await coworker.set(owner(), { op: "kind", kind: "overdue", on: "on" });
    await coworker.set(owner(), { op: "client", clientId: ids.founder });
    await coworker.runDaily();
    expect(await cardsIn(ids.founder)).toEqual([]);
    const [z] = await cardsIn(ids.zenith);
    expect(z!.wording).toBe("Open day poster is late. Move it to Friday?");
    expect(model.asked[0]!.tools).toEqual([]);
    // Over the co-worker's cap: the rules' words, and the AI isn't asked.
    await coworker.set(owner(), { op: "cap", rupees: 0 });
    await db.execute(sql`delete from coworker_suggestions`);
    today = "2026-10-22";
    await coworker.runDaily();
    expect((await cardsIn(ids.zenith))[0]!.wording).toBeNull();
    expect(model.asked).toHaveLength(1);
    await coworker.set(owner(), { op: "on" });
    today = "2026-10-23";
    expect(await coworker.runDaily()).toMatchObject({ posted: 0 });
  });
});
