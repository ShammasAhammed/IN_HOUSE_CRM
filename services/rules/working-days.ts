// Oppllo's working calendar (decision D32). Pure functions; the work week is a setting.

import { addDays, dayOfWeek, eachDay, type IsoDate } from "@/lib/dates";

export type WorkWeek = {
  /** 0 = Sunday … 6 = Saturday. */
  workingWeekdays: number[];
  /** Which Saturdays of the month are off, by occurrence: [2] = the second Saturday. */
  saturdaysOff: number[];
};

/** Monday–Saturday, second Saturday off. Office 9:30–18:30 IST. */
export const DEFAULT_WORK_WEEK: WorkWeek = { workingWeekdays: [1, 2, 3, 4, 5, 6], saturdaysOff: [2] };

/** 1 for the first such weekday of the month, 2 for the second … */
function occurrenceInMonth(date: IsoDate): number {
  return Math.floor((Number(date.slice(8, 10)) - 1) / 7) + 1;
}

export function isWorkingDay(date: IsoDate, week: WorkWeek, holidays: ReadonlySet<IsoDate> = new Set()): boolean {
  const dow = dayOfWeek(date);
  if (!week.workingWeekdays.includes(dow)) return false;
  if (dow === 6 && week.saturdaysOff.includes(occurrenceInMonth(date))) return false;
  return !holidays.has(date);
}

/** Working days from `from` to `to`, inclusive. */
export function workingDays(
  from: IsoDate,
  to: IsoDate,
  week: WorkWeek,
  holidays: ReadonlySet<IsoDate> = new Set(),
): IsoDate[] {
  return eachDay(from, to).filter((d) => isWorkingDay(d, week, holidays));
}

/** The nearest working day on or before `date`. */
export function previousWorkingDay(date: IsoDate, week: WorkWeek, holidays: ReadonlySet<IsoDate> = new Set()): IsoDate {
  let d = date;
  for (let i = 0; i < 14 && !isWorkingDay(d, week, holidays); i++) d = addDays(d, -1);
  return d;
}
