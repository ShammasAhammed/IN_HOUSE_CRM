// Google Gemini through the paid Gemini API (Stage 12.3), behind the same AiModel port. The only place that talks to
// Gemini. Plain fetch to generateContent (no SDK for a few calls). Paid tier only: Google doesn't use paid API data to
// improve its products.
// shortcut: no tool rounds yet (Gemini's function-calling schema differs from the strict tools the services write), so
// jobs with tools skip Gemini; add them here when a tool job should run on Gemini.
import type { AiModel, AiResult } from "@/repositories";
import { failureOf } from "./openai";
import { priced } from "./prices";

type Response = {
  candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; cachedContentTokenCount?: number };
  modelVersion?: string;
};

const BLOCKED = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION"]);

export function geminiModel(opts: { apiKey: string; model: string; fetch?: typeof fetch }): AiModel {
  const { model } = opts;
  const send = opts.fetch ?? fetch;
  return {
    connected: true,
    provider: "gemini",
    model,
    supportsTools: false,

    async answer(req): Promise<AiResult> {
      try {
        const res = await send(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "x-goog-api-key": opts.apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: req.system }] },
            contents: req.turns.map((t) => ({ role: t.role === "user" ? "user" : "model", parts: [{ text: t.text }] })),
            generationConfig: { maxOutputTokens: req.maxOutputTokens },
          }),
          signal: AbortSignal.timeout(120_000),
        });
        if (!res.ok) return { kind: "failed", reason: failureOf(res.status), message: `Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`, toolCalls: [], usage: [] };
        const data = (await res.json()) as Response;
        const m = data.usageMetadata ?? {};
        const cached = m.cachedContentTokenCount ?? 0;
        const usage = [priced(model, { input: (m.promptTokenCount ?? 0) - cached, output: (m.candidatesTokenCount ?? 0) + (m.thoughtsTokenCount ?? 0), cacheRead: cached })];
        const c = data.candidates?.[0];
        if (data.promptFeedback?.blockReason || (c?.finishReason && BLOCKED.has(c.finishReason))) return { kind: "answer", outcome: "refused", text: "", toolCalls: [], usage };
        const text = (c?.content?.parts ?? [])
          .filter((p) => !p.thought && p.text)
          .map((p) => p.text)
          .join("")
          .trim();
        if (c?.finishReason === "MAX_TOKENS") return { kind: "answer", outcome: "step_limit", text: text ? `${text}\n\n[The answer was cut off: it ran too long. Ask for less.]` : "", toolCalls: [], usage };
        return { kind: "answer", outcome: "answered", text, toolCalls: [], usage };
      } catch (err) {
        return { kind: "failed", reason: "busy", message: err instanceof Error ? err.message : String(err), toolCalls: [], usage: [] };
      }
    },
  };
}
