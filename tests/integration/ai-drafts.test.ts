// AI teammates (Stage 11.3): drafts on tasks, asked and decided by people who can change the task, through the AI
// limit and log, with a fake model (the real key isn't needed).
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { AiModel, AiRequest, FileStorage } from "@/repositories";
import { createAiService } from "@/services/ai";
import { createAiDraftService } from "@/services/ai-drafts";
import { createKnowledgeService } from "@/services/knowledge";
import { actorOf, addClient, addPerson, addProjectWithTask, eventsFor, fixedClock, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const clock = fixedClock("2026-10-18");
const asked: AiRequest[] = [];
let failing = false;
const model = (connected: boolean): AiModel => ({
  connected,
  // A Malayalam-first client's drafts go to Gemini or ChatGPT (12.3), so the fake plays one of them.
  provider: "openai",
  model: "fake-1",
  answer: async (r) => {
    asked.push(r);
    if (failing) return { kind: "failed", reason: "busy", message: "overloaded", toolCalls: [], usage: [] };
    return { kind: "answer", outcome: "answered", text: "  Open day this Sunday! [time]  ", toolCalls: [], usage: [{ model: "fake-1", inputTokens: 900, outputTokens: 200, cacheWriteTokens: 0, cacheReadTokens: 0, costMicroUsd: 10_000 }] };
  },
});
const knowledge = createKnowledgeService({ store, clock, storage: {} as FileStorage });
const make = (connected = true) => createAiDraftService({ store, clock, ai: createAiService({ store, clock, model: model(connected), inrPerUsd: 85 }), knowledge });
const drafts = make();
let owner = "";
let designer = "";
let other = "";
let task = "";
let zenith = "";

beforeEach(async () => {
  await wipe(db);
  asked.length = 0;
  failing = false;
  owner = await addPerson(db, "Faisal Rahman", ["owner"]);
  designer = await addPerson(db, "Nikhil Das", ["designer"]);
  other = await addPerson(db, "Sneha Joy", ["designer"]);
  zenith = await addClient(db, "Zenith IAS Academy", { members: [designer, other] });
  task = (await addProjectWithTask(db, zenith, { ownerId: designer })).taskId;
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("AI teammate drafts", () => {
  it("are asked for by someone who can change the task, with the client's knowledge base, and logged", async () => {
    await knowledge.save(actorOf(owner, ["owner"]), { clientId: zenith, version: "0", tone: "Warm, Malayalam first", donts: "No fee amounts" });
    const d = actorOf(designer, ["designer"]);
    const r = await drafts.request(d, { taskId: task, kind: "caption", instructions: "Mention parking" });
    expect(r.ok).toBe(true);
    expect(asked).toHaveLength(1);
    // No tools: the AI can't change anything, only write text.
    expect(asked[0]!.tools).toEqual([]);
    expect(asked[0]!.turns[0]!.text).toContain("Tone of voice: Warm, Malayalam first");
    expect(asked[0]!.turns[0]!.text).toContain("Mention parking");

    const mine = await drafts.forTask(d, task);
    expect(mine.ok && mine.value).toMatchObject({ canUse: true, blocked: null, drafts: [{ kind: "caption", body: "Open day this Sunday! [time]", status: "draft", requestedByName: "Nikhil Das", model: "fake-1", costPaise: null }] });
    const forOwner = await drafts.forTask(actorOf(owner, ["owner"]), task);
    expect(forOwner.ok && forOwner.value.drafts[0]!.costPaise).toBe(85);
    const [usage] = await db.execute<{ feature: string; person_id: string }>(sql`select feature, person_id from ai_usage`);
    expect(usage).toMatchObject({ feature: "teammate", person_id: designer });
    expect((await eventsFor(db, task)).map((e) => e.action)).toContain("task.ai_draft_created");
  });

  it("are refused for people who can only look at the task", async () => {
    const r = await drafts.request(actorOf(other, ["designer"]), { taskId: task, kind: "brief" });
    expect(r.ok ? "ok" : r.error.code).toBe("forbidden");
    const view = await drafts.forTask(actorOf(other, ["designer"]), task);
    expect(view.ok && view.value.canUse).toBe(false);
    expect(asked).toHaveLength(0);
  });

  it("are approved with edits or rejected once, never both", async () => {
    const d = actorOf(designer, ["designer"]);
    const made = await drafts.request(d, { taskId: task, kind: "script" });
    const draftId = made.ok ? made.value.id : "";
    const empty = await drafts.decide(d, { draftId, decision: "approve", body: "  " });
    expect(empty.ok ? null : empty.error.fieldErrors?.body).toEqual(["Write the text, or reject the draft."]);
    const viewer = await drafts.decide(actorOf(other, ["designer"]), { draftId, decision: "reject" });
    expect(viewer.ok ? "ok" : viewer.error.code).toBe("forbidden");
    expect(await drafts.decide(d, { draftId, decision: "approve", body: "Open day this Sunday at 10 am!" })).toEqual({ ok: true, value: { status: "approved" } });
    const again = await drafts.decide(actorOf(owner, ["owner"]), { draftId, decision: "reject" });
    expect(again.ok ? "ok" : again.error.code).toBe("conflict");
    const v = await drafts.forTask(d, task);
    expect(v.ok && v.value.drafts[0]).toMatchObject({ status: "approved", body: "Open day this Sunday at 10 am!", reviewedByName: "Nikhil Das" });
    const actions = (await eventsFor(db, task)).map((e) => e.action);
    expect(actions.filter((a) => a.startsWith("task.ai_draft"))).toEqual(["task.ai_draft_created", "task.ai_draft_approved"]);
  });

  it("say why when the AI is off, and save nothing when the AI fails", async () => {
    const off = make(false);
    const d = actorOf(designer, ["designer"]);
    const v = await off.forTask(d, task);
    expect(v.ok && v.value.blocked).toMatch(/.+/);
    const r = await off.request(d, { taskId: task, kind: "caption" });
    expect(r.ok ? "ok" : r.error.code).toBe("forbidden");
    failing = true;
    const busy = await drafts.request(d, { taskId: task, kind: "caption" });
    expect(busy.ok ? "ok" : busy.error.message).toMatch(/busy/);
    const after = await drafts.forTask(d, task);
    expect(after.ok && after.value.drafts).toEqual([]);
  });
});
