import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropicModel, priceCall } from "@/adapters/ai/anthropic";
import type { AiTool } from "@/repositories";
import { blockedReason, DAILY_QUESTIONS_PER_PERSON, monthRange, toPaise } from "@/services/rules/ai";

const usage = (input: number, output: number) => ({ input_tokens: input, output_tokens: output, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, iterations: null });
const message = (content: unknown[], stop: string, u: object = usage(1000, 200)) => ({ id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", content, stop_reason: stop, usage: u });

/** A stand-in for the SDK client: hands back the scripted replies in order and keeps each request. */
function fakeClient(replies: unknown[]) {
  const requests: Array<Record<string, unknown>> = [];
  const client = {
    beta: {
      messages: {
        stream(params: Record<string, unknown>) {
          // The adapter pushes onto the same array between rounds: keep a snapshot.
          requests.push(structuredClone(params));
          const next = replies.shift();
          return { finalMessage: async () => next };
        },
      },
    },
  } as unknown as Anthropic;
  return { client, requests };
}

const echo: AiTool = {
  name: "find_client",
  description: "Find a client",
  inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"], additionalProperties: false },
  run: async (input) => ({ ok: true, text: `found ${(input as { name: string }).name}` }),
};
const request = { system: "You help.", turns: [{ role: "user" as const, text: "Who is Zenith?" }], tools: [echo], effort: "low" as const, maxOutputTokens: 2000, maxSteps: 3, maxCostMicroUsd: 1_000_000 };

describe("AI spending rules (D85)", () => {
  it("prices calls from the model's rates, the unknown ones at the dearest", () => {
    // Opus 5.5: $4 in, $20 out per million → 1,000 in + 200 out = $0.008 = 8,000 millionths.
    expect(priceCall("claude-opus-5-5", usage(1000, 200)).costMicroUsd).toBe(8000);
    expect(priceCall("claude-opus-5-5", { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1000, cache_read_input_tokens: 10_000 }).costMicroUsd).toBe(5000 + 2000);
    expect(priceCall("some-new-model", usage(1000, 0)).costMicroUsd).toBe(10_000);
  });

  it("turns dollars into paise, rounding up", () => {
    expect(toPaise(8000, 90)).toBe(72); // $0.008 × ₹90 = ₹0.72
    expect(toPaise(1, 90)).toBe(1);
    expect(toPaise(0, 90)).toBe(0);
  });

  it("uses India's calendar month", () => {
    const { from, to, month } = monthRange("2026-10-15");
    expect(month).toBe("2026-10-01");
    expect(from.toISOString()).toBe("2026-09-30T18:30:00.000Z");
    expect(to.toISOString()).toBe("2026-10-31T18:30:00.000Z");
  });

  it("stops questions without a key, over the limit, or past the daily cap", () => {
    const fine = { connected: true, spentPaise: 100, limitPaise: 200_000, askedToday: 0 };
    expect(blockedReason(fine)).toBeNull();
    expect(blockedReason({ ...fine, connected: false })).toMatch(/switched on/);
    expect(blockedReason({ ...fine, spentPaise: 200_000 })).toMatch(/limit is reached/);
    expect(blockedReason({ ...fine, limitPaise: 0 })).toMatch(/switched the AI off/);
    expect(blockedReason({ ...fine, askedToday: DAILY_QUESTIONS_PER_PERSON })).toMatch(/daily limit/);
  });
});

describe("the Claude adapter", () => {
  it("runs the tool, sends the result back, and returns the answer with every call's cost", async () => {
    const { client, requests } = fakeClient([
      message([{ type: "tool_use", id: "t1", name: "find_client", input: { name: "Zenith" } }], "tool_use"),
      message([{ type: "text", text: "Zenith IAS Academy is active." }], "end_turn"),
    ]);
    const r = await anthropicModel({ apiKey: "k", client }).answer(request);
    expect(r).toMatchObject({ kind: "answer", outcome: "answered", text: "Zenith IAS Academy is active.", toolCalls: [{ name: "find_client", ok: true }] });
    expect(r.usage).toHaveLength(2);
    expect(requests[0]).toMatchObject({ model: "claude-opus-5-5", fallbacks: "default", betas: ["server-side-fallback-2026-07-01"], output_config: { effort: "low" }, thinking: { type: "adaptive" } });
    expect((requests[0]!.tools as Array<{ strict: boolean }>)[0]!.strict).toBe(true);
    const second = requests[1]!.messages as Array<{ role: string; content: unknown }>;
    expect(second.at(-1)).toEqual({ role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "found Zenith" }] });
  });

  it("reports a refusal without reading the content", async () => {
    const { client } = fakeClient([message([], "refusal")]);
    expect(await anthropicModel({ apiKey: "k", client }).answer(request)).toMatchObject({ kind: "answer", outcome: "refused", text: "" });
  });

  it("stops after the allowed rounds", async () => {
    const ask = () => message([{ type: "tool_use", id: "t", name: "find_client", input: { name: "x" } }], "tool_use");
    const { client, requests } = fakeClient([ask(), ask(), ask(), ask()]);
    const r = await anthropicModel({ apiKey: "k", client }).answer(request);
    expect(r).toMatchObject({ kind: "answer", outcome: "step_limit" });
    expect(requests).toHaveLength(3);
  });

  it("prices each model separately when the safety fallback answered", async () => {
    const u = { ...usage(0, 0), iterations: [
      { type: "message", model: "claude-opus-5-5", ...usage(1000, 0) },
      { type: "fallback_message", model: "claude-opus-4-8", ...usage(1000, 0) },
    ] };
    const { client } = fakeClient([message([{ type: "text", text: "ok" }], "end_turn", u)]);
    const r = await anthropicModel({ apiKey: "k", client }).answer(request);
    expect(r.usage.map((c) => [c.model, c.costMicroUsd])).toEqual([["claude-opus-5-5", 4000], ["claude-opus-4-8", 5000]]);
  });
});

describe("what the assistant's tools hand the model", () => {
  it("shows money in rupees, time in hours, dates in India, and leaves out empty fields, links and internal ids", async () => {
    const { compact } = await import("@/services/assistant");
    expect(
      compact({ id: "a", clientId: "c", ownerId: "o", feePaise: 4_500_000, loggedMinutes: 200, at: new Date("2026-10-15T04:30:00Z"), note: null, tags: [], link: "/api/files/x", canEdit: true, rank: "a0" }),
    ).toEqual({ id: "a", clientId: "c", fee: "₹45,000", logged: "3h 20m", at: "15 Oct, 10:00 am" });
  });
});
