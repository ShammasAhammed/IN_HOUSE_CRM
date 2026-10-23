// The AI router (Stage 12.3): tiers cheapest-first, missing keys, tools, Malayalam, locks, personal data; the lead
// hint's input; and each adapter against a fake fetch (no real API calls).
import { describe, expect, it } from "vitest";
import { readDecisions } from "@/adapters/ai/decision-fallback";
import { geminiModel } from "@/adapters/ai/gemini";
import { openAiModel } from "@/adapters/ai/openai";
import { jevDecisionModel, readAnswer } from "@/adapters/ai/typesafe";
import type { AiRequest, DecisionQuestion } from "@/repositories";
import { isMalayalam, NO_MALAYALAM, route, shiftTier, stripContacts, type ModelInfo, type RouterSettings } from "@/services/rules/ai-router";
import { LEAD_QUESTIONS, leadState, readLeadScore } from "@/services/rules/lead-score";

const m = (provider: string, model: string, supportsTools = true): ModelInfo => ({ provider, model, supportsTools });
const ALL = [
  m("anthropic", "claude-opus-5-5"),
  m("anthropic", "claude-sonnet-5-5"),
  m("anthropic", "claude-haiku-5-5"),
  m("openai", "gpt-5-nano"),
  m("openai", "gpt-5-mini"),
  m("openai", "gpt-5.5"),
  m("gemini", "gemini-3.5-flash-lite", false),
  m("gemini", "gemini-3.8-flash", false),
  m("gemini", "gemini-4-argon", false),
];
const order = (input: Partial<Parameters<typeof route>[0]> & { settings?: RouterSettings }) => {
  const r = route({ feature: "chat_catchup", tier: "fast", models: ALL, settings: {}, tools: false, personal: true, malayalam: false, ...input });
  return r.ok ? r.order.map((x) => x.model) : r.reason;
};

describe("the router's rules", () => {
  it("tries each tier cheapest-first, skipping providers with no key", () => {
    expect(order({ tier: "fast" })).toEqual(["gpt-5-nano", "claude-haiku-5-5", "gemini-3.5-flash-lite"]);
    expect(order({ tier: "standard" })).toEqual(["gpt-5-mini", "gemini-3.8-flash", "claude-sonnet-5-5"]);
    expect(order({ tier: "best" })).toEqual(["claude-opus-5-5", "gemini-4-argon", "gpt-5.5"]);
    expect(order({ tier: "fast", models: ALL.filter((x) => x.provider === "anthropic") })).toEqual(["claude-haiku-5-5"]);
  });

  it("keeps tool jobs on adapters that run tools", () => {
    expect(order({ tier: "best", tools: true })).toEqual(["claude-opus-5-5", "gpt-5.5"]);
    expect(order({ tier: "best", tools: true, models: ALL.filter((x) => x.provider === "gemini") })).toMatch(/No connected AI can look things up/);
  });

  it("sends Malayalam to Gemini or ChatGPT in the owner's order, never Claude, and says so when neither is there", () => {
    expect(isMalayalam("ഒരു അടിക്കുറിപ്പ് എഴുതൂ")).toBe(true);
    expect(isMalayalam("Write it in Malayalam please")).toBe(true);
    expect(isMalayalam("Write a caption")).toBe(false);
    expect(order({ tier: "standard", malayalam: true })).toEqual(["gemini-3.8-flash", "gpt-5-mini"]);
    expect(order({ tier: "standard", malayalam: true, settings: { malayalamFirst: "openai" } })).toEqual(["gpt-5-mini", "gemini-3.8-flash"]);
    expect(order({ tier: "best", malayalam: true, tools: true })).toEqual(["gpt-5.5"]);
    expect(order({ tier: "standard", malayalam: true, models: ALL.filter((x) => x.provider === "anthropic") })).toBe(NO_MALAYALAM);
    expect(order({ tier: "standard", malayalam: true, settings: { prefer: { chat_catchup: { model: "claude-sonnet-5-5", only: true } } } })).not.toContain("claude-sonnet-5-5");
  });

  it("follows the owner's order, first choice and lock", () => {
    expect(order({ tier: "fast", settings: { order: { fast: ["gemini-3.5-flash-lite", "gpt-5-nano", "claude-haiku-5-5"] } } })).toEqual(["gemini-3.5-flash-lite", "gpt-5-nano", "claude-haiku-5-5"]);
    expect(order({ tier: "fast", settings: { prefer: { chat_catchup: { model: "claude-sonnet-5-5", only: false } } } })).toEqual(["claude-sonnet-5-5", "gpt-5-nano", "claude-haiku-5-5", "gemini-3.5-flash-lite"]);
    expect(order({ tier: "fast", settings: { prefer: { chat_catchup: { model: "claude-haiku-5-5", only: true } } } })).toEqual(["claude-haiku-5-5"]);
    expect(order({ tier: "fast", settings: { prefer: { chat_catchup: { model: "gpt-5-nano", only: true } } }, models: ALL.filter((x) => x.provider !== "openai") })).toMatch(/locked to gpt-5-nano, which isn't connected/);
  });

  it("keeps personal data from providers the owner switched off, and lets other jobs through", () => {
    const settings: RouterSettings = { personal: { openai: false } };
    expect(order({ tier: "fast", settings })).toEqual(["claude-haiku-5-5", "gemini-3.5-flash-lite"]);
    expect(order({ tier: "fast", settings, personal: false })).toEqual(["gpt-5-nano", "claude-haiku-5-5", "gemini-3.5-flash-lite"]);
  });

  it("moves a tier for a hard or easy question, within the three", () => {
    expect([shiftTier("standard", "hard"), shiftTier("best", "hard"), shiftTier("best", "easy"), shiftTier("fast", "easy"), shiftTier("standard", null)]).toEqual(["best", "best", "standard", "fast", "standard"]);
  });
});

describe("what the decision helper reads about a lead", () => {
  it("never a name, phone or email, even inside notes and form answers", () => {
    const state = leadState(
      { institution: "St. Mary's Nursing College", contactRole: "Principal", district: "Kottayam", segment: "nursing", problem: "Need 60 admissions by June", timeline: "this month", seats: 60, channel: "meta", origin: "meta_form", campaign: "Nursing Oct", answers: { budget: "₹50,000 a month", "call me": "+91 98470 12345" } },
      ["Spoke to Sr. Ann, mail her at ann@stmarys.edu or 9847012345"],
    );
    expect(state).toContain("Kottayam");
    expect(state).not.toMatch(/98470|9847012345|ann@stmarys/);
    expect(stripContacts("call 0481-256 0000 or x@y.in")).toBe("call [phone] or [email]");
  });

  it("keeps a hint only when every answer fits", () => {
    const at = new Date("2026-10-21T06:30:00Z");
    const by = { provider: "typesafe", model: "jev-latest" };
    expect(readLeadScore("l1", { label: { value: "hot", probability: 0.82 }, score: { value: 8, probability: 0.6 }, junk: { value: false, probability: 0.97 } }, by, at)).toEqual({ leadId: "l1", label: "hot", score: 8, junk: false, surePercent: 82, provider: "typesafe", model: "jev-latest", scoredAt: at });
    expect(readLeadScore("l1", { label: { value: "maybe", probability: 1 }, score: { value: 8, probability: 1 }, junk: { value: false, probability: 1 } }, by, at)).toBeNull();
  });
});

describe("the adapters, with a fake fetch", () => {
  const request: AiRequest = { system: "Be brief.", turns: [{ role: "user", text: "Who is off?" }], tools: [], effort: "low", maxOutputTokens: 500, maxSteps: 3, maxCostMicroUsd: 1_000_000 };
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  it("OpenAI: runs a tool round and prices each call", async () => {
    const sent: Array<{ url: string; body: { model: string; messages: unknown[]; tools?: unknown[] } }> = [];
    const answers = [
      { choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "who_is_off", arguments: "{}" } }] } }], usage: { prompt_tokens: 1000, completion_tokens: 100, prompt_tokens_details: { cached_tokens: 0 } } },
      { choices: [{ finish_reason: "stop", message: { content: "Anu is off." } }], usage: { prompt_tokens: 2000, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 1000 } } },
    ];
    const fake = (async (url: string, init: RequestInit) => {
      sent.push({ url, body: JSON.parse(String(init.body)) });
      return reply(answers.shift());
    }) as typeof fetch;
    const tool = { name: "who_is_off", description: "Leave today", inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false }, run: async () => ({ ok: true, text: "Anu" }) };
    const r = await openAiModel({ apiKey: "k", model: "gpt-5-mini", fetch: fake }).answer({ ...request, tools: [tool] });
    expect(r).toMatchObject({ kind: "answer", outcome: "answered", text: "Anu is off.", toolCalls: [{ name: "who_is_off", ok: true }] });
    expect(r.usage.map((u) => u.costMicroUsd)).toEqual([450, 1000 * 0.25 + 1000 * 0.025 + 50 * 2]);
    expect(sent[1]!.body.messages.at(-1)).toEqual({ role: "tool", tool_call_id: "c1", content: "Anu" });
  });

  it("OpenAI and Gemini: a bad key, an overload and a refusal are told apart", async () => {
    const status = (n: number) => (async () => reply({ error: "x" }, n)) as unknown as typeof fetch;
    expect(await openAiModel({ apiKey: "k", model: "gpt-5-nano", fetch: status(401) }).answer(request)).toMatchObject({ kind: "failed", reason: "auth" });
    expect(await geminiModel({ apiKey: "k", model: "gemini-3.8-flash", fetch: status(503) }).answer(request)).toMatchObject({ kind: "failed", reason: "busy" });
    const refused = (async () => reply({ choices: [{ finish_reason: "stop", message: { content: null, refusal: "No." } }] })) as unknown as typeof fetch;
    expect(await openAiModel({ apiKey: "k", model: "gpt-5-nano", fetch: refused }).answer(request)).toMatchObject({ kind: "answer", outcome: "refused" });
  });

  it("Gemini: reads the text without thoughts and prices thinking as output", async () => {
    const fake = (async () => reply({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "plan…", thought: true }, { text: "നമസ്കാരം" }] } }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 100, thoughtsTokenCount: 100 } })) as unknown as typeof fetch;
    const g = geminiModel({ apiKey: "k", model: "gemini-3.8-flash", fetch: fake });
    expect(g.supportsTools).toBe(false);
    const r = await g.answer(request);
    expect(r).toMatchObject({ kind: "answer", outcome: "answered", text: "നമസ്കാരം" });
    expect(r.usage[0]!.costMicroUsd).toBe(1000 * 1.5 + 200 * 7.5);
  });

  it("Jev: sends questions keyed by id and reads value and probability back", async () => {
    const questions: DecisionQuestion[] = LEAD_QUESTIONS;
    let body: { model: string; questions: Record<string, { type: string }> } | null = null;
    const fake = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return reply({ model: "jev-1.13.0", answers: { label: { type: "choice", choice: "warm", confidence: 0.9, probabilities: { hot: 0.05, warm: 0.9, cold: 0.05 } }, score: { type: "score", score: 0.67, probabilities: { "5": 0.7, "6": 0.3 } }, junk: { type: "noul", noul: 0.1 } }, usage: { input_tokens: 400, output_tokens: 60 } });
    }) as typeof fetch;
    const r = await jevDecisionModel({ apiKey: "k", fetch: fake }).decide("state", questions);
    expect(body!.model).toBe("jev-latest");
    expect(Object.fromEntries(Object.entries(body!.questions).map(([k, v]) => [k, v.type]))).toEqual({ label: "choice", score: "score", junk: "noul" });
    expect(r).toMatchObject({ ok: true, answers: { label: { value: "warm", probability: 0.9 }, score: { value: 6, probability: 0.7 }, junk: { value: false, probability: 0.9 } } });
    expect(readAnswer(questions[0]!, { type: "choice", choice: "lukewarm" })).toBeNull();
  });

  it("the Haiku fallback's JSON is checked before it is believed", () => {
    const qs: DecisionQuestion[] = [{ id: "d", kind: "choice", instructions: "", options: { easy: "", hard: "" } }, { id: "m", kind: "yesno", instructions: "" }];
    expect(readDecisions('Sure: {"d":{"value":"easy","probability":0.9},"m":{"value":false,"probability":0.8}}', qs)).toEqual({ d: { value: "easy", probability: 0.9 }, m: { value: false, probability: 0.8 } });
    expect(readDecisions('{"d":{"value":"medium","probability":0.9},"m":{"value":false,"probability":0.8}}', qs)).toBeNull();
    expect(readDecisions('{"d":{"value":"easy","probability":1.4},"m":{"value":false,"probability":0.8}}', qs)).toBeNull();
  });
});
