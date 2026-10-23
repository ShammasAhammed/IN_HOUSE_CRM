// The personal assistant (Stage 12.4), with fake models: the morning plan by rules (no AI needed), heads-up only within
// what the person may see, the day's summary written once, drafts that follow the client's tone and the Malayalam rule
// and send nothing, promises as suggestions only (date in code, reminder or task on a click, private to the writer),
// the week's summary, Ask's "My work" mode, and the switches.
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { newId } from "@/lib/id";
import type { AiModel, AiRequest, AiResult, DecisionModel, DecisionResult, FileStorage } from "@/repositories";
import { createAiService } from "@/services/ai";
import { createAssetService } from "@/services/assets";
import { createChatService } from "@/services/chat";
import { createGrowthService } from "@/services/growth";
import { createKnowledgeService } from "@/services/knowledge";
import { createLeaveService } from "@/services/leave";
import { createMyAssistantService } from "@/services/my-assistant";
import { createProjectService } from "@/services/projects";
import { createSpaceAccessService } from "@/services/space-access";
import { createTaskService } from "@/services/tasks";
import { actorOf, addClient, addLeaveSetup, addPerson, addProjectWithTask, addTime, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
let today = "2026-10-21";
const clock = { today: () => today, now: () => new Date(`${today}T06:30:00Z`) };

function fake(provider: string, model: string, reply = "fine"): AiModel & { asked: AiRequest[] } {
  const asked: AiRequest[] = [];
  return {
    connected: true,
    provider,
    model,
    asked,
    async answer(req): Promise<AiResult> {
      asked.push(req);
      return { kind: "answer", outcome: "answered", text: reply, toolCalls: [], usage: [{ model, inputTokens: 100, outputTokens: 20, cacheWriteTokens: 0, cacheReadTokens: 0, costMicroUsd: 1000 }] };
    },
  };
}
function decider(result: DecisionResult): DecisionModel & { states: string[] } {
  const states: string[] = [];
  return { connected: true, provider: "typesafe", model: "jev-latest", states, decide: async (state) => (states.push(state), result) };
}
const promise = (yes: boolean, due: string): DecisionResult => ({ ok: true, answers: { promise: { value: yes, probability: 0.92 }, due: { value: due, probability: 0.8 } }, usage: [] });

function build(models: AiModel[] = [], decisions: DecisionModel[] = []) {
  const ai = createAiService({ store, clock, models, decisions, inrPerUsd: 90 });
  const chat = createChatService({ store, clock, storage: {} as FileStorage });
  const tasks = createTaskService({ store, clock });
  const knowledge = createKnowledgeService({ store, clock, storage: {} as FileStorage });
  const me = createMyAssistantService({
    store,
    clock,
    ai,
    tasks,
    leave: createLeaveService({ store, clock }),
    assets: createAssetService({ store, clock, storage: {} as FileStorage }),
    chat,
    spaceAccess: createSpaceAccessService({ store, clock }),
    knowledge,
    growth: createGrowthService({ store, clock }),
    projects: createProjectService({ store, clock }),
  });
  return { me, chat, tasks, knowledge };
}

const ids = { owner: "", strategist: "", designer: "", intern: "", zenith: "", alpha: "", founder: "", zenithProject: "", alphaProject: "" };
const named = (id: string, roles: Parameters<typeof actorOf>[1], fullName: string) => ({ ...actorOf(id, roles), fullName });
const owner = () => named(ids.owner, ["owner"], "Faisal Rahman");
const strategist = () => named(ids.strategist, ["strategist"], "Anjali Nair");
const designer = () => named(ids.designer, ["designer"], "Nikhil Das");
const count = async (table: string) => Number((await db.execute<{ n: number }>(sql`select count(*)::int as n from ${sql.raw(table)}`))[0]!.n);
const day = (t: ReturnType<typeof createTaskService>, a: ReturnType<typeof owner>) => t.myDay(a).then((r) => (r.ok ? r.value : Promise.reject(new Error("no day"))));

beforeEach(async () => {
  await wipe(db);
  today = "2026-10-21";
  const types = await addLeaveSetup(db);
  ids.owner = await addPerson(db, "Faisal Rahman", ["owner"]);
  ids.strategist = await addPerson(db, "Anjali Nair", ["strategist"]);
  ids.designer = await addPerson(db, "Nikhil Das", ["designer"]);
  ids.intern = await addPerson(db, "Rahul K", ["intern"]);
  ids.zenith = await addClient(db, "Zenith IAS Academy", { members: [ids.designer] });
  ids.alpha = await addClient(db, "Alpha Nursing College");
  ids.founder = newId();
  await db.insert(s.clients).values({ id: ids.founder, name: "Founder office", isInternal: true, isPrivate: true, status: "active" });
  await db.insert(s.clientMembers).values({ clientId: ids.founder, personId: ids.designer, level: "edit" });
  // The strategist's own day: a normal and an urgent task today, one late.
  const a = await addProjectWithTask(db, ids.zenith, { ownerId: ids.strategist, dueDate: today });
  ids.zenithProject = a.projectId;
  await db.insert(s.tasks).values([
    { id: newId(), projectId: a.projectId, clientId: ids.zenith, title: "Urgent banner", ownerId: ids.strategist, dueDate: today, priority: "urgent", rank: "a1" },
    { id: newId(), projectId: a.projectId, clientId: ids.zenith, title: "Late report", ownerId: ids.strategist, dueDate: "2026-10-15", rank: "a2" },
    // The designer's work due soon: one on Zenith (the strategist sees it), one in the private space (only members do).
    { id: newId(), projectId: a.projectId, clientId: ids.zenith, title: "Open day poster", ownerId: ids.designer, dueDate: "2026-10-22", rank: "a3" },
  ]);
  const f = await addProjectWithTask(db, ids.founder, { ownerId: ids.designer, dueDate: "2026-10-22" });
  await db.update(s.tasks).set({ title: "Secret fundraise deck" }).where(sql`project_id = ${f.projectId}`);
  ids.alphaProject = (await addProjectWithTask(db, ids.alpha, {})).projectId;
  await db.update(s.tasks).set({ rank: "a0" }).where(sql`rank = 'm'`);
  // The designer is on leave today and tomorrow.
  await db.insert(s.leaveRequests).values({ id: newId(), personId: ids.designer, leaveTypeId: types.casual, startDate: today, endDate: "2026-10-22", status: "approved" });
  // One unread mention for the strategist.
  await db.insert(s.notifications).values({ id: newId(), personId: ids.strategist, kind: "task.mentioned", title: "Nikhil mentioned you" });
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("the morning plan", () => {
  it("is built by rules with no AI: urgent first, late work, what waits, and who's away", async () => {
    const { me, tasks } = build();
    const plan = await me.plan(strategist(), await day(tasks, strategist()));
    expect(plan.doFirst.map((t) => t.title)).toEqual(["Urgent banner", "Task"]);
    expect([plan.overdueCount, plan.overdue[0]?.title]).toEqual([1, "Late report"]);
    expect(plan.waiting).toEqual([{ key: "mentions", label: "unread mention", count: 1, href: "/notifications" }]);
    expect(plan.headsUp).toEqual([{ personName: "Nikhil Das", until: "2026-10-22", tasks: [expect.objectContaining({ title: "Open day poster", clientName: "Zenith IAS Academy" })] }]);
    expect(JSON.stringify(plan)).not.toMatch(/fundraise/i);
    expect(await me.planSummary(strategist(), plan)).toBeNull();
    // The owner sees the private space, so its task shows for them.
    const ownerPlan = await me.plan(owner(), await day(tasks, owner()));
    expect(ownerPlan.headsUp[0]!.tasks.map((t) => t.title).sort()).toEqual(["Open day poster", "Secret fundraise deck"]);
  });

  it("gets its AI summary once a day, as plain data", async () => {
    const m = fake("openai", "gpt-5-nano", "Start with the urgent banner; one report is late.");
    const { me, tasks } = build([m]);
    const plan = await me.plan(strategist(), await day(tasks, strategist()));
    expect(await me.planSummary(strategist(), plan)).toBe("Start with the urgent banner; one report is late.");
    expect(await me.planSummary(strategist(), plan)).toBe("Start with the urgent banner; one report is late.");
    expect(m.asked).toHaveLength(1);
    expect(m.asked[0]!.turns[0]!.text).toContain("<data>");
    today = "2026-10-22";
    await me.planSummary(strategist(), plan);
    expect(m.asked).toHaveLength(2);
    expect(Number((await db.execute<{ n: number }>(sql`select count(*)::int as n from ai_usage where feature = 'assistant_plan'`))[0]!.n)).toBe(2);
  });
});

describe("draft replies", () => {
  it("follow the client's tone, take Malayalam threads to Gemini or ChatGPT, and send nothing", async () => {
    const claude = fake("anthropic", "claude-sonnet-5-5", "Sure, sharing it today.");
    const gemini = fake("gemini", "gemini-3.8-flash", "ശരി, ഇന്ന് അയക്കാം.");
    const { me, chat, knowledge } = build([claude, gemini]);
    // The owner put Claude first for Standard jobs: English drafts go there, Malayalam ones still never do.
    await db.insert(s.settings).values({ key: "ai_router", value: { order: { standard: ["claude-sonnet-5-5", "gemini-3.8-flash", "gpt-5-mini"] } } });
    await knowledge.save(owner(), { clientId: ids.zenith, version: "0", tone: "Warm and formal", donts: "Never promise ranks" });
    const zenith = await chat.openClient(strategist(), ids.zenith);
    const channelId = zenith.ok ? zenith.value.id : "";
    await chat.send(owner(), { channelId, body: "Can we get the poster today?" }, null);
    const messages = await count("chat_messages");
    const r = await me.draftReply(strategist(), { kind: "chat", channelId });
    expect(r).toMatchObject({ ok: true, value: { text: "Sure, sharing it today." } });
    expect(claude.asked[0]!.turns[0]!.text).toMatch(/Warm and formal[\s\S]*Never promise ranks/);
    await chat.send(owner(), { channelId, body: "പോസ്റ്റർ ഇന്ന് കിട്ടുമോ?" }, null);
    const ml = await me.draftReply(strategist(), { kind: "chat", channelId });
    expect(ml).toMatchObject({ ok: true, value: { text: "ശരി, ഇന്ന് അയക്കാം." } });
    expect(claude.asked).toHaveLength(1);
    expect(await count("chat_messages")).toBe(messages + 1);
    // A thread they can't see: nothing.
    expect((await me.draftReply(named(ids.intern, ["intern"], "Rahul K"), { kind: "chat", channelId })).ok).toBe(false);
  });
});

describe("promises", () => {
  it("are suggestions: the date is worked out in code, and nothing else is created", async () => {
    const jev = decider(promise(true, "friday"));
    const { me } = build([fake("openai", "gpt-5-nano")], [jev]);
    const [tasksBefore, notesBefore] = [await count("tasks"), await count("notifications")];
    const p = await me.notePromise(designer(), { source: "chat", sourceId: newId(), link: "/chat/x", text: "I'll send the poster by Friday, call me on 98470 12345" });
    expect(p).toMatchObject({ status: "open", duePhrase: "friday", dueOn: "2026-10-23", personId: ids.designer });
    expect(jev.states[0]).not.toContain("98470");
    expect(await me.notePromise(designer(), { source: "chat", sourceId: newId(), link: "/chat/x", text: "Looks good, thanks" })).toBeNull();
    expect(jev.states).toHaveLength(1);
    expect([await count("tasks"), await count("notifications")]).toEqual([tasksBefore, notesBefore]);
    const no = build([fake("openai", "gpt-5-nano")], [decider(promise(false, "none"))]);
    expect(await no.me.notePromise(designer(), { source: "task", sourceId: newId(), link: "/tasks/x", text: "Will you send it tomorrow?" })).toBeNull();
  });

  it("become a reminder or a task only on the writer's click, through the task rules, and only the writer sees them", async () => {
    const { me } = build([fake("openai", "gpt-5-nano")], [decider(promise(true, "tomorrow"))]);
    const a = (await me.notePromise(designer(), { source: "chat", sourceId: newId(), link: "/chat/x", text: "I'll share the reel tomorrow" }))!;
    const b = (await me.notePromise(designer(), { source: "chat", sourceId: newId(), link: "/chat/y", text: "will finish the brochure tomorrow" }))!;
    expect((await me.promises(strategist())).promises).toEqual([]);
    expect(await me.decidePromise(strategist(), { promiseId: a.id, action: "kept" })).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect((await me.decidePromise(designer(), { promiseId: a.id, action: "remind" })).ok).toBe(true);
    expect(await me.runReminders()).toEqual({ sent: 0, errors: [] });
    today = "2026-10-22";
    expect(await me.runReminders()).toEqual({ sent: 1, errors: [] });
    expect(await me.runReminders()).toEqual({ sent: 0, errors: [] });
    expect((await db.execute<{ person_id: string; kind: string }>(sql`select person_id, kind from notifications where kind = 'assistant.reminder'`)).map((n) => n.person_id)).toEqual([ids.designer]);
    // Not on Alpha: the task service refuses, and the promise stays open.
    expect((await me.decidePromise(designer(), { promiseId: b.id, action: "task", projectId: ids.alphaProject })).ok).toBe(false);
    const made = await me.decidePromise(designer(), { promiseId: b.id, action: "task", projectId: ids.zenithProject });
    expect(made.ok).toBe(true);
    expect((await db.execute(sql`select owner_id, due_date from tasks where id = ${made.ok ? made.value.taskId : null}`))[0]).toEqual({ owner_id: ids.designer, due_date: "2026-10-22" });
    // The reminder stays until it's marked kept; the one made a task has left the list.
    expect((await me.promises(designer())).promises.map((p) => [p.id, p.status])).toEqual([[a.id, "reminder"]]);
    // The event says what was chosen, never the words.
    expect(JSON.stringify((await db.execute(sql`select data from events where action = 'assistant.promise_settled'`)).map((e) => e.data))).not.toMatch(/reel|brochure/);
  });

  it("missed ones show in the morning plan", async () => {
    const { me, tasks } = build([fake("openai", "gpt-5-nano")], [decider(promise(true, "today"))]);
    await me.notePromise(strategist(), { source: "task", sourceId: newId(), link: "/tasks/x", text: "I'll call the principal today" });
    today = "2026-10-22";
    const plan = await me.plan(strategist(), await day(tasks, strategist()));
    expect(plan.promises.map((p) => [p.excerpt, p.dueOn])).toEqual([["I'll call the principal today", "2026-10-21"]]);
  });
});

describe("report help and switches", () => {
  it("lists this week's own work only, by client", async () => {
    const { me } = build();
    const done = newId();
    await db.insert(s.tasks).values([
      { id: done, projectId: ids.zenithProject, clientId: ids.zenith, title: "Reel cut", ownerId: ids.strategist, status: "done", completedAt: new Date("2026-10-20T08:00:00Z"), rank: "b1" },
      { id: newId(), projectId: ids.zenithProject, clientId: ids.zenith, title: "Someone else's", ownerId: ids.designer, status: "done", completedAt: new Date("2026-10-20T08:00:00Z"), rank: "b2" },
      { id: newId(), projectId: ids.zenithProject, clientId: ids.zenith, title: "Last week", ownerId: ids.strategist, status: "done", completedAt: new Date("2026-10-12T08:00:00Z"), rank: "b3" },
    ]);
    await addTime(db, { taskId: done, personId: ids.strategist, clientId: ids.zenith, engagementId: null, minutes: 90, workDate: "2026-10-20" });
    expect(await me.week(strategist())).toEqual({ from: "2026-10-19", to: "2026-10-21", clients: [{ clientName: "Zenith IAS Academy", tasks: ["Reel cut"], minutes: 90 }], totalMinutes: 90, doneCount: 1 });
  });

  it("each person can switch parts off; the owner can switch the AI parts off for everyone", async () => {
    const jev = decider(promise(true, "friday"));
    const { me, chat } = build([fake("openai", "gpt-5-mini")], [jev]);
    expect((await me.setPart(designer(), { part: "promises" })).ok).toBe(true);
    expect(await me.notePromise(designer(), { source: "chat", sourceId: newId(), link: "/x", text: "I'll send it by Friday" })).toBeNull();
    expect(jev.states).toHaveLength(0);
    expect((await me.status(strategist())).prefs.promises).toBe(true);
    expect((await me.setOwnerSetting(strategist(), {})).ok).toBe(false);
    expect((await me.setOwnerSetting(owner(), {})).ok).toBe(true);
    const zenith = await chat.openClient(strategist(), ids.zenith);
    await chat.send(owner(), { channelId: zenith.ok ? zenith.value.id : "", body: "Poster?" }, null);
    expect(await me.draftReply(strategist(), { kind: "chat", channelId: zenith.ok ? zenith.value.id : "" })).toMatchObject({ ok: false, error: { message: expect.stringMatching(/switched the assistant's AI off/) } });
    expect((await me.status(strategist())).aiReason).toMatch(/switched/);
  });
});
