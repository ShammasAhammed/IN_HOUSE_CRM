// Retainer rules (decisions D22–D27). Pure functions: no I/O, fully unit-tested.
//
// - A retainer period is one calendar month.
// - A start or end inside a month prorates that month's hours and fee by calendar days.
// - Unused hours expire, unless the engagement's policy is "rollover": then the unused part of the
//   month's own budget moves to the next month only, capped at one full month's budget.
//   Rolled-in hours are used first and never roll again. Overage never carries forward.
// - Warnings at 80% and 100% of (base + rolled-in). Over 100% warns, never blocks.

import {
  daysInMonth,
  diffDays,
  endOfMonth,
  maxDate,
  minDate,
  startOfMonth,
  type IsoDate,
} from "@/lib/dates";
import type { RolloverPolicy } from "@/lib/types";

export type PeriodTerms = {
  periodStart: IsoDate;
  periodEnd: IsoDate;
  /** Calendar days of the month the engagement covers. */
  coveredDays: number;
  baseBudgetMinutes: number;
  feePaise: number;
};

/** Budgets are rounded to the nearest 15 minutes so screens never show odd fractions. */
const roundToQuarterHour = (minutes: number) => Math.round(minutes / 15) * 15;

/**
 * The terms of the calendar month containing `anyDateInMonth` for an engagement running from
 * `engagementStart` to `engagementEnd` (inclusive, null = open-ended). Null when the engagement does not
 * cover any day of that month.
 */
export function periodTerms(input: {
  engagementStart: IsoDate;
  engagementEnd: IsoDate | null;
  anyDateInMonth: IsoDate;
  monthlyBudgetMinutes: number;
  monthlyFeePaise: number;
}): PeriodTerms | null {
  const monthStart = startOfMonth(input.anyDateInMonth);
  const monthEnd = endOfMonth(input.anyDateInMonth);
  const from = maxDate(monthStart, input.engagementStart);
  const to = input.engagementEnd ? minDate(monthEnd, input.engagementEnd) : monthEnd;
  if (to < from) return null;

  const coveredDays = diffDays(from, to) + 1;
  const monthDays = daysInMonth(monthStart);
  const share = coveredDays / monthDays;

  return {
    periodStart: monthStart,
    periodEnd: monthEnd,
    coveredDays,
    baseBudgetMinutes: coveredDays === monthDays ? input.monthlyBudgetMinutes : roundToQuarterHour(input.monthlyBudgetMinutes * share),
    feePaise: coveredDays === monthDays ? input.monthlyFeePaise : Math.round(input.monthlyFeePaise * share),
  };
}

/** Minutes that roll from a finished period into the next one. */
export function rolloverMinutes(input: {
  policy: RolloverPolicy;
  /** The full (unprorated) monthly budget — the cap. */
  monthlyBudgetMinutes: number;
  previous: { baseBudgetMinutes: number; rolloverInMinutes: number; usedMinutes: number };
}): number {
  if (input.policy !== "rollover") return 0;
  const { baseBudgetMinutes, rolloverInMinutes, usedMinutes } = input.previous;
  // Rolled-in hours are consumed first; only the month's own budget can roll on.
  const usedFromBase = Math.max(0, usedMinutes - rolloverInMinutes);
  const unusedBase = Math.max(0, baseBudgetMinutes - usedFromBase);
  return Math.min(unusedBase, input.monthlyBudgetMinutes);
}

export type BurnLevel = "ok" | "warning" | "over";

export type Burn = {
  budgetMinutes: number;
  usedMinutes: number;
  remainingMinutes: number;
  /** used / budget, as a whole percent. 0 when there is no budget and nothing used. */
  usedPercent: number;
  /** How far through the period today is, as a whole percent. */
  elapsedPercent: number;
  /** Days left in the period after today (0 on the last day). */
  daysLeft: number;
  level: BurnLevel;
  /** Thresholds crossed: 80 and/or 100. */
  crossed: Array<80 | 100>;
};

export const WARN_AT = 80;
export const OVER_AT = 100;

/** Where a period stands today. */
export function burn(input: {
  baseBudgetMinutes: number;
  rolloverInMinutes: number;
  usedMinutes: number;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  today: IsoDate;
}): Burn {
  const budget = input.baseBudgetMinutes + input.rolloverInMinutes;
  const used = input.usedMinutes;
  // Integer maths: (46 × 100) / 40 is exactly 115, whereas 46 / 40 × 100 floors to 114.
  const usedPercent = budget > 0 ? Math.floor((used * 100) / budget) : used > 0 ? 100 : 0;

  const totalDays = diffDays(input.periodStart, input.periodEnd) + 1;
  const elapsedDays = Math.min(totalDays, Math.max(0, diffDays(input.periodStart, input.today) + 1));
  const crossed: Array<80 | 100> = [];
  if (usedPercent >= WARN_AT) crossed.push(80);
  if (usedPercent >= OVER_AT) crossed.push(100);

  return {
    budgetMinutes: budget,
    usedMinutes: used,
    remainingMinutes: budget - used,
    usedPercent,
    elapsedPercent: Math.round((elapsedDays / totalDays) * 100),
    daysLeft: Math.max(0, diffDays(input.today, input.periodEnd)),
    level: usedPercent >= OVER_AT ? "over" : usedPercent >= WARN_AT ? "warning" : "ok",
    crossed,
  };
}
