// Time logging rules (decision D34). Pure.
import { addDays, addMonths, startOfMonth, type IsoDate } from "@/lib/dates";

/** Own entries can be added or changed until the 5th of the following month; then the month is locked. */
export function timeLockedOn(workDate: IsoDate): IsoDate {
  return addDays(startOfMonth(addMonths(workDate, 1)), 5); // the 6th: locked from this day on
}

export function isTimeLocked(workDate: IsoDate, today: IsoDate): boolean {
  return today >= timeLockedOn(workDate);
}

/** The quick buttons on My Day (D34): 30 minutes, 1 hour, 2 hours. */
export const QUICK_LOG_MINUTES = [30, 60, 120] as const;

/** Under this share of a day's expected hours, the day is "short" on the Friday screen (D72). */
export const SHORT_BELOW_PERCENT = 75;

export type DayFill = "off" | "upcoming" | "empty" | "short" | "ok";

/**
 * How well a day's time is filled in (D72). Days off, today and later days are never flagged: today isn't over.
 * A past working day with nothing logged is "empty"; under 75% of what was expected, "short".
 */
export function dayFill(input: { date: IsoDate; today: IsoDate; expectedMinutes: number; loggedMinutes: number }): DayFill {
  if (input.expectedMinutes <= 0) return "off";
  if (input.date >= input.today) return input.loggedMinutes >= input.expectedMinutes ? "ok" : "upcoming";
  if (input.loggedMinutes === 0) return "empty";
  return input.loggedMinutes * 100 < input.expectedMinutes * SHORT_BELOW_PERCENT ? "short" : "ok";
}
