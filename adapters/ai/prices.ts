// What each AI model costs (Stage 12.3), in one place for every provider. Dollars per million tokens: input, output,
// cache write, cache read. Dollars per million tokens is the same number as millionths of a dollar per token.
// shortcut: copied from the providers' pricing pages on 19 Oct 2026 (anthropic.com/pricing,
// developers.openai.com/api/docs/pricing, ai.google.dev/gemini-api/docs/pricing); check them there whenever a provider
// announces new prices or the bill and Settings → AI disagree. Where a price is due to rise, the higher one is used so
// the spending limit errs on the safe side.
import type { AiCallUsage } from "@/repositories";

export type Price = { input: number; output: number; cacheWrite: number; cacheRead: number };

export const PRICES: Record<string, Price> = {
  // Anthropic
  "claude-opus-5-5": { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
  "claude-opus-5": { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  "claude-opus-4-8": { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  // OpenAI (no separate cache-write charge: cached input is read cheaper, everything else is input)
  "gpt-5-nano": { input: 0.05, output: 0.4, cacheWrite: 0.05, cacheRead: 0.005 },
  "gpt-5-mini": { input: 0.25, output: 2, cacheWrite: 0.25, cacheRead: 0.025 },
  "gpt-5.5": { input: 5, output: 30, cacheWrite: 5, cacheRead: 0.5 },
  // Google Gemini, paid tier (output includes thinking). Flash and Pro double on 1 Jan 2027 and 1 Dec 2026: those prices.
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5, cacheWrite: 0.3, cacheRead: 0.03 },
  "gemini-3.8-flash": { input: 1.5, output: 7.5, cacheWrite: 1.5, cacheRead: 0.15 },
  "gemini-4-argon": { input: 4, output: 20, cacheWrite: 4, cacheRead: 0.2 },
  // shortcut: TypeSafe publishes no per-token price for Jev while it is in early access; priced like a small model
  // until it does.
  "jev-latest": { input: 1, output: 5, cacheWrite: 1, cacheRead: 1 },
};

/** A model missing from the table is priced as the dearest one, so the spending limit errs on the safe side. */
export const UNKNOWN: Price = { input: 10, output: 50, cacheWrite: 12.5, cacheRead: 1 };

/** One call's usage and what it cost, from its token counts. */
export function priced(model: string, t: { input: number; output: number; cacheWrite?: number; cacheRead?: number }): AiCallUsage {
  const p = PRICES[model] ?? UNKNOWN;
  const cacheWriteTokens = t.cacheWrite ?? 0;
  const cacheReadTokens = t.cacheRead ?? 0;
  const cost = t.input * p.input + t.output * p.output + cacheWriteTokens * p.cacheWrite + cacheReadTokens * p.cacheRead;
  return { model, inputTokens: t.input, outputTokens: t.output, cacheWriteTokens, cacheReadTokens, costMicroUsd: Math.ceil(cost) };
}
