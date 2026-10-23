// Recurring tasks (D35, D71). Pure functions, unit-tested.
//
// - Weekly on a weekday (Monday–Saturday) or monthly on day 1–28, or on the month's last working day (31).
// - A date that falls on a day off (holiday, off-Saturday) moves to the working day before it.
// - The task starts `leadWorkingDays` working days before it is due.
// - Tasks are made two weeks ahead by the daily job, never for days already past.

import { addDays, dayOfWeek, eachDay, endOfMonth, maxDate, minDate, startOfMonth, type IsoDate } from "@/lib/dates";
import type { RecurrenceFrequency } from "@/lib/types";
import { isWorkingDay, previousWorkingDay, type WorkWeek } from "./working-days";

export type Schedule = {
  frequency: RecurrenceFrequency;
  /** Weekly: 1 = Monday … 6 = Saturday. */
  weekday: number | null;
  /** Monthly: 1–28, or 31 for the last working day. */
  dayOfMonth: number | null;
  startsOn: IsoDate;
  endsOn: IsoDate | null;
};

/** How far ahead the daily job makes tasks (D35). */
export const HORIZON_DAYS = 14;

export const LAST_WORKING_DAY = 31;

/**
 * Due dates of a schedule whose nominal date is in [from, to] (and inside its own start and end), each moved to the
 * working day before when it falls on a day off. Sorted, without repeats.
 */
export function dueDates(schedule: Schedule, from: IsoDate, to: IsoDate, week: WorkWeek, holidays: ReadonlySet<IsoDate> = new Set()): IsoDate[] {
  const start = maxDate(from, schedule.startsOn);
  const end = schedule.endsOn ? minDate(to, schedule.endsOn) : to;
  if (end < start) return [];

  const nominal: IsoDate[] = [];
  if (schedule.frequency === "weekly") {
    for (const d of eachDay(start, end)) if (dayOfWeek(d) === schedule.weekday) nominal.push(d);
  } else {
    for (let month = startOfMonth(start); month <= end; month = addDays(endOfMonth(month), 1)) {
      const d = schedule.dayOfMonth === LAST_WORKING_DAY ? endOfMonth(month) : `${month.slice(0, 8)}${String(schedule.dayOfMonth).padStart(2, "0")}`;
      if (d >= start && d <= end) nominal.push(d);
    }
  }
  return [...new Set(nominal.map((d) => previousWorkingDay(d, week, holidays)))].sort();
}

/** The day work starts: `lead` working days before the due date (0 = the same day). */
export function startDateFor(due: IsoDate, lead: number, week: WorkWeek, holidays: ReadonlySet<IsoDate> = new Set()): IsoDate {
  let d = due;
  for (let left = lead, guard = 0; left > 0 && guard < 60; guard++) {
    d = addDays(d, -1);
    if (isWorkingDay(d, week, holidays)) left--;
  }
  return d;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

/** "Every Monday", "Monthly on the 5th", "Monthly on the last working day". */
export function describeSchedule(s: Pick<Schedule, "frequency" | "weekday" | "dayOfMonth">): string {
  if (s.frequency === "weekly") return `Every ${WEEKDAYS[s.weekday ?? 1]}`;
  return s.dayOfMonth === LAST_WORKING_DAY ? "Monthly on the last working day" : `Monthly on the ${ordinal(s.dayOfMonth ?? 1)}`;
}
