// Company and team goals (Stage 14.3): periods, health and progress. Pure, unit-tested.
//   - Periods follow India's financial year: a year is April to March, quarters are Apr–Jun, Jul–Sep, Oct–Dec and
//     Jan–Mar, months are calendar months (D-14.3b).
//   - Health is 11.1's rule: with x% of the period gone, x% of the target is expected; below 80% of that pace is at
//     risk, below 50% off track. The first tenth of a period is too early to judge. A goal whose number is a level,
//     not a total (a percent, or active clients now), is judged against the whole target, not the pace.
//   - Blank isn't zero: a goal with no number yet is at risk ("check in"), never off track; a target of 0, or a period
//     not started, has nothing to judge.
import { addDays, addMonths, diffDays, type IsoDate } from "@/lib/dates";
import type { GoalPeriod, GoalSource, GoalUnit } from "@/lib/types";
import { AT_RISK_BELOW, OFF_TRACK_BELOW, type HealthLevel } from "./results";

export const STALE_CHECKIN_DAYS = 14;
const TOO_EARLY = 0.1;

/** The financial year, quarter or month that `date` falls in. */
export function periodOf(kind: GoalPeriod, date: IsoDate): { startsOn: IsoDate; endsOn: IsoDate } {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const first = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, "0")}-01`;
  let start: IsoDate;
  let months: number;
  if (kind === "month") {
    start = first(y, m);
    months = 1;
  } else if (kind === "quarter") {
    // Financial quarters start in April, July, October and January.
    const qm = m >= 4 ? 4 + Math.floor((m - 4) / 3) * 3 : 1;
    start = first(y, qm);
    months = 3;
  } else {
    start = first(m >= 4 ? y : y - 1, 4);
    months = 12;
  }
  return { startsOn: start, endsOn: addDays(addMonths(start, months), -1) };
}

/** "FY 2026–27", "Q3 FY 2026–27", "Oct 2026". */
export function periodLabel(kind: GoalPeriod, startsOn: IsoDate): string {
  const y = Number(startsOn.slice(0, 4));
  const m = Number(startsOn.slice(5, 7));
  const fy = (fyStart: number) => `FY ${fyStart}–${String((fyStart + 1) % 100).padStart(2, "0")}`;
  if (kind === "month") return new Date(`${startsOn}T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
  if (kind === "quarter") return `Q${m >= 4 ? Math.floor((m - 4) / 3) + 1 : 4} ${fy(m >= 4 ? y : y - 1)}`;
  return fy(y);
}

/** How much of the period has gone on `today`, 0–1. */
export function elapsedShare(startsOn: IsoDate, endsOn: IsoDate, today: IsoDate): number {
  if (today < startsOn) return 0;
  if (today >= endsOn) return 1;
  return (diffDays(startsOn, today) + 1) / (diffDays(startsOn, endsOn) + 1);
}

/** A level, not a running total: judged against the whole target. */
export const isLevel = (unit: GoalUnit, source: GoalSource) => unit === "percent" || source === "active_clients";

export type GoalHealth = { level: HealthLevel; percent: number | null; expected: number | null; reasons: string[] };

export function goalHealth(g: { target: number; actual: number | null; unit: GoalUnit; source: GoalSource; startsOn: IsoDate; endsOn: IsoDate; today: IsoDate }): GoalHealth {
  const percent = g.actual === null || !g.target ? null : Math.round((g.actual * 1000) / g.target) / 10;
  if (!g.target) return { level: "no_target", percent, expected: null, reasons: ["No target set"] };
  if (g.today < g.startsOn) return { level: "no_target", percent, expected: null, reasons: [`Starts ${g.startsOn}`] };
  if (g.actual === null) return { level: "at_risk", percent: null, expected: null, reasons: ["No number yet: post a check-in"] };
  const elapsed = elapsedShare(g.startsOn, g.endsOn, g.today);
  const expected = isLevel(g.unit, g.source) ? g.target : g.target * elapsed;
  const pace = g.actual / expected;
  if (pace >= AT_RISK_BELOW) return { level: "on_track", percent, expected, reasons: [] };
  if (!isLevel(g.unit, g.source) && elapsed < TOO_EARLY) return { level: "on_track", percent, expected, reasons: ["Too early to judge"] };
  return { level: pace < OFF_TRACK_BELOW ? "off_track" : "at_risk", percent, expected, reasons: [`${Math.round(pace * 100)}% of the pace expected by now`] };
}

/** Projects behind a team goal: their open and done tasks as a share. Null with no tasks. */
export const supportPercent = (done: number, total: number) => (total ? Math.round((done * 100) / total) : null);
