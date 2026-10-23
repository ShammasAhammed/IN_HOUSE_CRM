// Pure rules for AI spending (Stage 9.1, D85).
import { addMonths, istInstant, startOfMonth, type IsoDate } from "@/lib/dates";
import type { AiCallUsage } from "@/repositories";

/** D54: ₹2,000 a month until the owner changes it. */
export const DEFAULT_MONTHLY_LIMIT_PAISE = 200_000;
/** One person can't spend the month's money in an afternoon. */
export const DAILY_QUESTIONS_PER_PERSON = 40;
/** Dollars to rupees when the host doesn't say (AI_INR_PER_USD). Kept on the high side so the limit errs safe. */
export const DEFAULT_INR_PER_USD = 90;

export type AiLimit = { monthlyPaise: number };

/** Millionths of a dollar → paise, rounded up. */
export const toPaise = (microUsd: number, inrPerUsd: number): number => Math.ceil((microUsd * inrPerUsd) / 10_000);

/** The calendar month in India that holds `day`, as instants: [from, to). */
export function monthRange(day: IsoDate): { from: Date; to: Date; month: IsoDate } {
  const month = startOfMonth(day);
  return { from: istInstant(month, "00:00"), to: istInstant(addMonths(month, 1), "00:00"), month };
}

export function dayRange(day: IsoDate): { from: Date; to: Date } {
  const from = istInstant(day, "00:00");
  return { from, to: new Date(from.getTime() + 86_400_000) };
}

export function sumUsage(calls: readonly AiCallUsage[]) {
  return calls.reduce(
    (t, c) => ({
      inputTokens: t.inputTokens + c.inputTokens,
      outputTokens: t.outputTokens + c.outputTokens,
      cacheWriteTokens: t.cacheWriteTokens + c.cacheWriteTokens,
      cacheReadTokens: t.cacheReadTokens + c.cacheReadTokens,
      costMicroUsd: t.costMicroUsd + c.costMicroUsd,
    }),
    { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, costMicroUsd: 0 },
  );
}

/** Why a question can't be asked now, or null when it can. */
export function blockedReason(s: { connected: boolean; spentPaise: number; limitPaise: number; askedToday: number }): string | null {
  if (!s.connected) return "The AI isn't switched on yet. The owner adds the API key.";
  if (s.limitPaise === 0) return "The owner has switched the AI off for now (Settings → AI).";
  if (s.spentPaise >= s.limitPaise) return "This month's AI spending limit is reached. The owner can raise it in Settings → AI.";
  if (s.askedToday >= DAILY_QUESTIONS_PER_PERSON) return `You've asked ${DAILY_QUESTIONS_PER_PERSON} questions today, the daily limit. It resets at midnight.`;
  return null;
}
