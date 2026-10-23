// TypeSafe's Jev (Stage 12.3): a small model that answers Choice, Score and yes/no ("noul") questions about a text,
// each with how sure it is. The only place that talks to TypeSafe. Plain fetch.
// shortcut: Jev is in early access; the request shape is from docs.typesafe.ai's quickstart (19 Oct 2026). If TypeSafe
// changes it, only this file changes; until then a failure falls back to Claude Haiku.
import type { DecisionAnswer, DecisionModel, DecisionQuestion, DecisionResult } from "@/repositories";
import { priced } from "./prices";

type Answer = { type: "choice" | "score" | "noul"; choice?: string; score?: number; noul?: number; confidence?: number; probabilities?: Record<string, number> };

function question(q: DecisionQuestion) {
  if (q.kind === "choice") return { type: "choice", instructions: q.instructions, criteria: q.options };
  if (q.kind === "score") return { type: "score", instructions: q.instructions, criteria: q.levels };
  return { type: "noul", instructions: q.instructions };
}

/** Jev's answer in our shape: a score is its most likely level (counted from 1), a noul is yes from 0.5. */
export function readAnswer(q: DecisionQuestion, a: Answer | undefined): DecisionAnswer | null {
  if (!a) return null;
  if (q.kind === "choice" && typeof a.choice === "string" && a.choice in q.options) return { value: a.choice, probability: a.probabilities?.[a.choice] ?? a.confidence ?? 0 };
  if (q.kind === "score") {
    const top = Object.entries(a.probabilities ?? {}).sort((x, y) => y[1] - x[1])[0];
    if (top) return { value: Number(top[0]) + 1, probability: top[1] };
    if (typeof a.score === "number") return { value: Math.round(a.score) + 1, probability: a.confidence ?? 0 };
    return null;
  }
  if (q.kind === "yesno" && typeof a.noul === "number") return { value: a.noul >= 0.5, probability: Math.max(a.noul, 1 - a.noul) };
  return null;
}

export function jevDecisionModel(opts: { apiKey: string; fetch?: typeof fetch }): DecisionModel {
  const send = opts.fetch ?? fetch;
  const model = "jev-latest";
  return {
    connected: true,
    provider: "typesafe",
    model,
    async decide(state, questions): Promise<DecisionResult> {
      try {
        const res = await send("https://api.typesafe.ai/v1/systemone", {
          method: "POST",
          headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ state, model, questions: Object.fromEntries(questions.map((q) => [q.id, question(q)])) }),
          signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) return { ok: false, message: `TypeSafe ${res.status}: ${(await res.text()).slice(0, 200)}`, usage: [] };
        const data = (await res.json()) as { answers?: Record<string, Answer>; usage?: { input_tokens?: number; output_tokens?: number } };
        const usage = [priced(model, { input: data.usage?.input_tokens ?? 0, output: data.usage?.output_tokens ?? 0 })];
        const answers: Record<string, DecisionAnswer> = {};
        for (const q of questions) {
          const a = readAnswer(q, data.answers?.[q.id]);
          if (!a) return { ok: false, message: `Jev gave no usable answer to "${q.id}".`, usage };
          answers[q.id] = a;
        }
        return { ok: true, answers, usage };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : String(err), usage: [] };
      }
    },
  };
}
