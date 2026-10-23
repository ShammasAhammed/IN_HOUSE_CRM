// The AI router in the AI service (Stage 12.3), with a fake model for every provider: escalation on each kind of
// failure, every attempt logged and counted against the same limits, Malayalam never to Claude, the decision helper's
// hint (and its fallback, and the rules when it's unsure), the owner's settings, and lead hints that never change leads.
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import type { AiModel, AiRequest, AiResult, DecisionModel, DecisionResult } from "@/repositories";
import { newId } from "@/lib/id";
import { createAiService } from "@/services/ai";
import { createLeadScoreService } from "@/services/lead-scores";
import { DAILY_QUESTIONS_PER_PERSON } from "@/services/rules/ai";
import { NO_MALAYALAM } from "@/services/rules/ai-router";
import { actorOf, addPerson, fixedClock, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const clock = fixedClock("2026-10-21");

type Reply = Partial<AiResult> | "fail" | "busy" | "refuse" | "empty";
/** A provider's model that answers as scripted (one reply per call, the last repeating) and keeps what it was asked. */
function fake(provider: string, model: string, replies: Reply[] = [{}], supportsTools = true): AiModel & { asked: AiRequest[] } {
  const asked: AiRequest[] = [];
  return {
    connected: true,
    provider,
    model,
    supportsTools,
    asked,
    async answer(req): Promise<AiResult> {
      asked.push(req);
      const r = replies[Math.min(asked.length - 1, replies.length - 1)]!;
      const usage = [{ model, inputTokens: 1000, outputTokens: 100, cacheWriteTokens: 0, cacheReadTokens: 0, costMicroUsd: 10_000 }];
      if (r === "fail") return { kind: "failed", reason: "error", message: "boom", toolCalls: [], usage: [] };
      if (r === "busy") return { kind: "failed", reason: "busy", message: "overloaded", toolCalls: [], usage: [] };
      if (r === "refuse") return { kind: "answer", outcome: "refused", text: "", toolCalls: [], usage };
      if (r === "empty") return { kind: "answer", outcome: "answered", text: "  ", toolCalls: [], usage };
      return { kind: "answer", outcome: "answered", text: `${model} says hi`, toolCalls: [], usage, ...r } as AiResult;
    },
  };
}
const providers = () => ({
  opus: fake("anthropic", "claude-opus-5-5"),
  haiku: fake("anthropic", "claude-haiku-5-5"),
  sonnet: fake("anthropic", "claude-sonnet-5-5"),
  nano: fake("openai", "gpt-5-nano"),
  mini: fake("openai", "gpt-5-mini"),
  gpt: fake("openai", "gpt-5.5"),
  lite: fake("gemini", "gemini-3.5-flash-lite", [{}], false),
  flash: fake("gemini", "gemini-3.8-flash", [{}], false),
  pro: fake("gemini", "gemini-4-argon", [{}], false),
});
function decider(provider: string, result: DecisionResult | ((state: string) => DecisionResult)): DecisionModel & { states: string[] } {
  const states: string[] = [];
  return { connected: true, provider, model: `${provider}-model`, states, decide: async (state) => (states.push(state), typeof result === "function" ? result(state) : result) };
}
const build = (models: AiModel[], decisions: DecisionModel[] = []) => createAiService({ store, clock, models, decisions, inrPerUsd: 90 });
const ask = (text: string, extra: Partial<AiRequest> = {}): AiRequest => ({ system: "s", turns: [{ role: "user", text }], tools: [], effort: "low", maxOutputTokens: 500, maxSteps: 2, maxCostMicroUsd: 50_000, ...extra });
const tool = { name: "t", description: "t", inputSchema: {}, run: async () => ({ ok: true, text: "" }) };
const rows = () => db.execute<{ model: string; outcome: string; escalated_from: string | null; feature: string }>(sql`select model, outcome, escalated_from, feature from ai_usage order by created_at, id`);

let owner = "";
let bdo = "";
const me = () => actorOf(owner, ["owner"]);

beforeEach(async () => {
  await wipe(db);
  owner = await addPerson(db, "Faisal Rahman", ["owner"]);
  bdo = await addPerson(db, "Muhammed Ajmal", ["bdo"]);
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("routing and escalation", () => {
  it("takes the cheapest connected model of the feature's tier", async () => {
    const p = providers();
    const r = await build(Object.values(p)).ask(me(), "chat_catchup", ask("catch me up"));
    expect(r.ok && [r.value.provider, r.value.model]).toEqual(["openai", "gpt-5-nano"]);
    const best = await build(Object.values(p)).ask(me(), "client_report", ask("write the report"));
    expect(best.ok && best.value.model).toBe("claude-opus-5-5");
    // No OpenAI key: the next in line.
    const noOpenAi = await build([p.opus, p.haiku, p.lite]).ask(me(), "chat_catchup", ask("catch me up"));
    expect(noOpenAi.ok && noOpenAi.value.model).toBe("claude-haiku-5-5");
  });

  it("moves on after an error, an outage, a refusal, an empty answer and a bad shape, logging every attempt", async () => {
    const order = ["gpt-5-mini", "gemini-3.8-flash", "claude-sonnet-5-5"];
    for (const [first, second] of [["fail", "busy"], ["refuse", "empty"]] as const) {
      await wipe(db);
      owner = await addPerson(db, "Faisal Rahman", ["owner"]);
      const r = await build([fake("openai", order[0]!, [first]), fake("gemini", order[1]!, [second], false), fake("anthropic", order[2]!)]).ask(me(), "teammate", ask("draft a caption"));
      expect(r.ok && r.value.model).toBe("claude-sonnet-5-5");
      expect((await rows()).map((x) => [x.model, x.outcome, x.escalated_from])).toEqual([
        ["gpt-5-mini", first === "refuse" ? "refused" : "failed", null],
        ["gemini-3.8-flash", "failed", "gpt-5-mini"],
        ["claude-sonnet-5-5", "answered", "gemini-3.8-flash"],
      ]);
    }
    const shaped = await build([fake("openai", "gpt-5-mini", [{ text: "Here are some tasks!" }]), fake("anthropic", "claude-sonnet-5-5", [{ text: '{"tasks":[]}' }])]).ask(me(), "chat_tasks", ask("tasks", { accept: (t) => t.startsWith("{") }));
    expect(shaped.ok && shaped.value.text).toBe('{"tasks":[]}');
    const all = await build([fake("openai", "gpt-5-mini", ["busy"]), fake("anthropic", "claude-sonnet-5-5", ["busy"])]).ask(me(), "teammate", ask("x"));
    expect(all).toMatchObject({ ok: false, error: { message: "The AI is busy right now. Try again in a minute." } });
  });

  it("counts every attempt against the one daily cap and monthly limit, whichever provider", async () => {
    const p = providers();
    await db.insert(s.aiUsage).values(Array.from({ length: DAILY_QUESTIONS_PER_PERSON - 1 }, () => ({ id: newId(), personId: owner, feature: "assistant" as const, provider: "openai", model: "gpt-5-nano", outcome: "answered" as const, calls: 1, inputTokens: 1, outputTokens: 1, cacheWriteTokens: 0, cacheReadTokens: 0, costMicroUsd: 1, costPaise: 1, createdAt: clock.now() })));
    // The first model fails; the escalation would be the 41st question today, so it stops there.
    const r = await build([fake("openai", "gpt-5-nano", ["fail"]), p.haiku]).ask(me(), "chat_catchup", ask("catch me up"));
    expect(r).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(p.haiku.asked).toHaveLength(0);
    await wipe(db);
    owner = await addPerson(db, "Faisal Rahman", ["owner"]);
    await db.insert(s.settings).values({ key: "ai_limit", value: { monthlyPaise: 100 }, updatedById: owner });
    const spent = await build([fake("gemini", "gemini-3.5-flash-lite", [{ usage: [{ model: "gemini-3.5-flash-lite", inputTokens: 1, outputTokens: 1, cacheWriteTokens: 0, cacheReadTokens: 0, costMicroUsd: 2_000_000 }] }], false)]).ask(me(), "chat_catchup", ask("x"));
    expect(spent.ok).toBe(true);
    expect(await build([p.nano]).ask(me(), "chat_catchup", ask("again"))).toMatchObject({ ok: false, error: { message: expect.stringMatching(/limit is reached/) } });
  });

  it("sends Malayalam to Gemini or ChatGPT only, and says clearly when neither is connected", async () => {
    const p = providers();
    const r = await build(Object.values(p)).ask(me(), "teammate", ask("നഴ്സിങ് കോളേജിന് ഒരു അടിക്കുറിപ്പ് എഴുതൂ"));
    expect(r.ok && r.value.model).toBe("gemini-3.8-flash");
    const fromClaudeOnly = await build([p.opus, p.sonnet, p.haiku]).ask(me(), "teammate", ask("Write the caption in Malayalam"));
    expect(fromClaudeOnly).toMatchObject({ ok: false, error: { message: NO_MALAYALAM } });
    expect(p.sonnet.asked).toHaveLength(0);
  });

  it("uses the owner's lock, first choice, order and personal-data switches", async () => {
    const p = providers();
    const ai = build(Object.values(p));
    expect((await ai.setRouter(actorOf(bdo, ["bdo"]), { op: "malayalam", first: "openai" })).ok).toBe(false);
    await ai.setRouter(me(), { op: "prefer", feature: "chat_catchup", model: "claude-sonnet-5-5", only: "on" });
    expect(await ai.ask(me(), "chat_catchup", ask("x"))).toMatchObject({ ok: true, value: { model: "claude-sonnet-5-5" } });
    await ai.setRouter(me(), { op: "prefer", feature: "chat_catchup", model: "" });
    await ai.setRouter(me(), { op: "move", tier: "fast", model: "claude-haiku-5-5", by: -1 });
    expect(await ai.ask(me(), "chat_catchup", ask("x"))).toMatchObject({ ok: true, value: { model: "claude-haiku-5-5" } });
    await ai.setRouter(me(), { op: "personal", provider: "anthropic" });
    expect(await ai.ask(me(), "chat_catchup", ask("x"))).toMatchObject({ ok: true, value: { model: "gpt-5-nano" } });
    expect(await ai.ask(me(), "chat_catchup", ask("x", { personal: false }))).toMatchObject({ ok: true, value: { model: "claude-haiku-5-5" } });
    await ai.setRouter(me(), { op: "malayalam", first: "openai" });
    expect(await ai.ask(me(), "teammate", ask("മലയാളം"))).toMatchObject({ ok: true, value: { model: "gpt-5-mini" } });
    expect((await db.execute(sql`select count(*)::int as n from events where action = 'setting.changed'`))[0]).toEqual({ n: 5 });
  });
});

describe("comparing models", () => {
  it("is the owner's, runs exactly the model asked for, and is logged as compare", async () => {
    const p = providers();
    const ai = build(Object.values(p));
    expect((await ai.compare(actorOf(bdo, ["bdo"]), "gpt-5.5", ask("x"))).ok).toBe(false);
    expect(await ai.compare(me(), "gemini-4-argon", ask("ഒരു അടിക്കുറിപ്പ്"))).toMatchObject({ ok: true, value: { model: "gemini-4-argon" } });
    expect(await ai.compare(me(), "gpt-9", ask("x"))).toMatchObject({ ok: false, error: { code: "invalid" } });
    expect((await rows()).map((x) => [x.feature, x.model])).toEqual([["compare", "gemini-4-argon"]]);
  });
});

describe("the decision helper", () => {
  const sure = (difficulty: string, p: number): DecisionResult => ({ ok: true, answers: { difficulty: { value: difficulty, probability: p }, malayalam: { value: false, probability: 0.99 } }, usage: [] });

  it("moves an easy Ask question down a tier, ignores an unsure hint, and falls back from Jev to Haiku", async () => {
    const p = providers();
    const easy = await build(Object.values(p), [decider("typesafe", sure("easy", 0.9))]).ask(me(), "assistant", ask("who is off today?", { tools: [tool] }));
    expect(easy.ok && easy.value.model).toBe("gpt-5-mini"); // standard tier, tools: Gemini Flash skipped
    const unsure = await build(Object.values(p), [decider("typesafe", sure("easy", 0.5))]).ask(me(), "assistant", ask("who is off today?", { tools: [tool] }));
    expect(unsure.ok && unsure.value.model).toBe("claude-opus-5-5");
    const jev = decider("typesafe", { ok: false, message: "down", usage: [] });
    const haiku = decider("anthropic", sure("easy", 0.95));
    const fallback = await build(Object.values(p), [jev, haiku]).ask(me(), "assistant", ask("who is off?", { tools: [tool] }));
    expect(fallback.ok && fallback.value.model).toBe("gpt-5-mini");
    expect((await rows()).filter((x) => x.feature === "route_hint").map((x) => [x.model, x.outcome])).toEqual([
      ["typesafe-model", "answered"],
      ["typesafe-model", "answered"],
      ["typesafe-model", "failed"],
      ["anthropic-model", "answered"],
    ]);
    // Off in Settings: no hint asked, the plain rules decide.
    const off = decider("typesafe", sure("easy", 0.99));
    const ai = build(Object.values(p), [off]);
    await ai.setRouter(me(), { op: "helper", use: "hints" });
    expect(await ai.ask(me(), "assistant", ask("x", { tools: [tool] }))).toMatchObject({ ok: true, value: { model: "claude-opus-5-5" } });
    expect(off.states).toHaveLength(0);
  });

  it("scores new leads as a hint, never changing the lead, and never sees a phone or email", async () => {
    const leadId = newId();
    await db.insert(s.leads).values({ id: leadId, name: "Sr. Ann", phone: "+91 98470 12345", email: "ann@stmarys.edu", institution: "St. Mary's Nursing College", district: "Kottayam", stage: "new", origin: "meta_form", answers: { "call me on": "9847012345" } });
    const before = (await db.execute(sql`select stage, score, owner_id, tags, updated_at from leads where id = ${leadId}`))[0];
    const jev = decider("typesafe", { ok: true, answers: { label: { value: "hot", probability: 0.8 }, score: { value: 8, probability: 0.6 }, junk: { value: false, probability: 0.9 } }, usage: [] });
    const leads = createLeadScoreService({ store, clock, ai: build(Object.values(providers()), [jev]) });
    expect(await leads.scoreNew(actorOf(bdo, ["bdo"]))).toEqual({ ok: true, value: 1 });
    expect(jev.states[0]).toContain("Kottayam");
    expect(jev.states[0]).not.toMatch(/Ann|98470|9847012345|stmarys\.edu/);
    expect((await leads.forLeads(actorOf(bdo, ["bdo"]), [leadId])).get(leadId)).toMatchObject({ label: "hot", score: 8, junk: false, surePercent: 80 });
    expect((await db.execute(sql`select stage, score, owner_id, tags, updated_at from leads where id = ${leadId}`))[0]).toEqual(before);
    expect(await leads.scoreLead(actorOf(bdo, ["bdo"]), leadId)).toEqual({ ok: true, value: false });
    // Already scored: not asked again. Not sales: nothing.
    expect(await leads.scoreNew(actorOf(bdo, ["bdo"]))).toEqual({ ok: true, value: 0 });
    expect((await leads.scoreNew(actorOf(owner, ["designer"]))).ok).toBe(false);
  });
});
