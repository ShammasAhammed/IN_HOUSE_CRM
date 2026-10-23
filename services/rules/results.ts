// Results per client (Stage 11.1): what a month's numbers mean. Pure functions: no I/O, fully unit-tested.
//
// - Costs are whole paise, rates are percentages to one decimal; anything that would divide by zero or by a number
//   nobody entered is null (shown as "—"), never NaN or Infinity.
// - Health judges results against the month's targets at the pace the month has gone (40% of the month gone → 40% of
//   the target expected). The first week is too early to judge, so then the whole of last month is judged instead.
//   Below 80% of the expected pace is at risk, below 50% off track. Retainer hours at or over budget is at risk:
//   it costs Oppllo, but isn't a result the client feels. A target with no number entered is at risk (enter it).
//   With no target and no hours problem there is nothing to judge.
import { addMonths, daysInMonth, startOfMonth, type IsoDate } from "@/lib/dates";
import type { MonthNumbers } from "@/repositories";

export const HEALTH_LEVELS = ["on_track", "at_risk", "off_track", "no_target"] as const;
export type HealthLevel = (typeof HEALTH_LEVELS)[number];
export type Health = { level: HealthLevel; month: IsoDate; reasons: string[] };

export const AT_RISK_BELOW = 0.8;
export const OFF_TRACK_BELOW = 0.5;
const JUDGE_FROM_DAY = 8;

/** Spend divided by a count, in whole paise; null when either is missing or the count is zero. */
export function costPer(spendPaise: number | null, count: number | null): number | null {
  return spendPaise === null || !count ? null : Math.round(spendPaise / count);
}

/** part as a percentage of whole, one decimal; null when either is missing or whole is zero. */
export function ratePercent(part: number | null, whole: number | null): number | null {
  return part === null || !whole ? null : Math.round((part * 1000) / whole) / 10;
}

/** The month health looks at on `today`, and how much of it has gone (0–1). */
export function judgedMonth(today: IsoDate): { month: IsoDate; elapsed: number } {
  const day = Number(today.slice(8, 10));
  if (day < JUDGE_FROM_DAY) return { month: startOfMonth(addMonths(startOfMonth(today), -1)), elapsed: 1 };
  return { month: startOfMonth(today), elapsed: day / daysInMonth(today) };
}

const RANK: Record<HealthLevel, number> = { no_target: 0, on_track: 1, at_risk: 2, off_track: 3 };

/** `results`: the judged month's numbers, or null when none were entered. `burnPercent`: the highest retainer burn now. */
export function clientHealth(input: { today: IsoDate; results: MonthNumbers | null; burnPercent: number | null }): Health {
  const { month, elapsed } = judgedMonth(input.today);
  let level: HealthLevel = "no_target";
  const reasons: string[] = [];
  const worse = (l: HealthLevel) => {
    if (RANK[l] > RANK[level]) level = l;
  };
  const r = input.results;
  for (const [label, actual, target] of [
    ["Leads", r?.leads ?? null, r?.targetLeads ?? null],
    ["Admissions", r?.admissions ?? null, r?.targetAdmissions ?? null],
  ] as const) {
    if (!target) continue;
    if (actual === null) {
      // Missing numbers are a nudge to enter them, not proof the month went badly.
      reasons.push(`${label} not entered yet (target ${target})`);
      worse("at_risk");
      continue;
    }
    const expected = target * elapsed;
    const pace = actual / expected;
    const by = elapsed < 1 ? ` (${Math.round(expected)} expected by now)` : "";
    if (pace < AT_RISK_BELOW) reasons.push(`${label} ${actual} of ${target}${by}`);
    worse(pace < OFF_TRACK_BELOW ? "off_track" : pace < AT_RISK_BELOW ? "at_risk" : "on_track");
  }
  if (input.burnPercent !== null && input.burnPercent >= 100) {
    reasons.push(`Retainer hours at ${input.burnPercent}% of budget`);
    worse("at_risk");
  }
  return { level, month, reasons };
}
