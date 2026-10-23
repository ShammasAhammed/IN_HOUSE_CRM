// Capacity and load for the Week view (decision D33). Pure functions, fully unit-tested.
//
// - A person's capacity per working day = weekly hours / the standard working days of that week
//   (the work-week setting, ignoring holidays). Holidays and full leave days have no capacity; a half day of
//   leave halves it. So a week with a holiday or leave really has less room.
// - A task's estimate (60 minutes when missing) is spread evenly over the working days from its start date
//   to its due date. With no start date it spreads over the working days of the due date's week, up to the due
//   date. Open tasks that are overdue put all their load on today. Tasks with no due date are unscheduled.

import { addDays, eachDay, startOfWeek, type IsoDate } from "@/lib/dates";
import type { TaskStatus } from "@/lib/types";
import { isWorkingDay, type WorkWeek } from "./working-days";

export const DEFAULT_ESTIMATE_MINUTES = 60;

export type CapacityCalendar = { week: WorkWeek; holidays: ReadonlySet<IsoDate> };

/** Working days of the standard week (holidays ignored): the denominator for a day's share of weekly hours. */
function standardDaysInWeek(weekStart: IsoDate, week: WorkWeek): number {
  return eachDay(weekStart, addDays(weekStart, 6)).filter((d) => isWorkingDay(d, week)).length;
}

/** Minutes of capacity on each day of the week starting `weekStart` (a Monday). */
export function dailyCapacity(input: {
  weeklyMinutes: number;
  weekStart: IsoDate;
  calendar: CapacityCalendar;
  /** The person's approved leave in that week: full = 1, half day = 0.5. */
  leave: ReadonlyMap<IsoDate, 0.5 | 1>;
  /** Before they joined or after they left there's no capacity (the Week and Time screens agree, test report L2). */
  joinDate?: IsoDate;
  endDate?: IsoDate | null;
}): Map<IsoDate, number> {
  const days = eachDay(input.weekStart, addDays(input.weekStart, 6));
  const standard = standardDaysInWeek(input.weekStart, input.calendar.week);
  const perDay = standard > 0 ? input.weeklyMinutes / standard : 0;
  const out = new Map<IsoDate, number>();
  for (const d of days) {
    const employed = (!input.joinDate || d >= input.joinDate) && (!input.endDate || d <= input.endDate);
    if (!employed || !isWorkingDay(d, input.calendar.week, input.calendar.holidays)) {
      out.set(d, 0);
      continue;
    }
    const away = input.leave.get(d) ?? 0;
    out.set(d, Math.round(perDay * (1 - away)));
  }
  return out;
}

export type TaskForLoad = {
  estimateMinutes: number | null;
  startDate: IsoDate | null;
  dueDate: IsoDate | null;
  status: TaskStatus;
};

/** Minutes of a task's estimate placed on each day. Empty for unscheduled tasks. */
export function taskLoad(task: TaskForLoad, today: IsoDate, calendar: CapacityCalendar): Map<IsoDate, number> {
  const out = new Map<IsoDate, number>();
  if (!task.dueDate) return out;
  const minutes = task.estimateMinutes ?? DEFAULT_ESTIMATE_MINUTES;
  if (minutes <= 0) return out;

  // Overdue and still open: it is all today's problem.
  if (task.status !== "done" && task.dueDate < today) {
    out.set(today, minutes);
    return out;
  }

  const from = task.startDate && task.startDate <= task.dueDate ? task.startDate : startOfWeek(task.dueDate);
  let days = eachDay(from, task.dueDate).filter((d) => isWorkingDay(d, calendar.week, calendar.holidays));
  if (days.length === 0) days = [task.dueDate];

  const share = Math.floor(minutes / days.length);
  days.forEach((d, i) => out.set(d, share + (i === days.length - 1 ? minutes - share * days.length : 0)));
  // A done task keeps its past days (what the week looked like) but frees today and later (QA S9-04).
  if (task.status === "done") for (const d of [...out.keys()]) if (d >= today) out.delete(d);
  return out;
}

export type DayLoad = { date: IsoDate; capacityMinutes: number; assignedMinutes: number };

export type WeekLoad = {
  days: DayLoad[];
  capacityMinutes: number;
  assignedMinutes: number;
  /** assigned / capacity as a whole percent; null when there is no capacity at all. */
  loadPercent: number | null;
  level: "light" | "ok" | "over";
};

/** Under this share of capacity a week looks "pale" in the Week view; over 100% is red. */
export const LIGHT_BELOW = 50;

/** A person's week: capacity and assigned load per day and in total. */
export function weekLoad(input: {
  weekStart: IsoDate;
  today: IsoDate;
  weeklyMinutes: number;
  leave: ReadonlyMap<IsoDate, 0.5 | 1>;
  tasks: readonly TaskForLoad[];
  calendar: CapacityCalendar;
  joinDate?: IsoDate;
  endDate?: IsoDate | null;
}): WeekLoad {
  const capacity = dailyCapacity(input);
  const assigned = new Map<IsoDate, number>();
  for (const t of input.tasks) {
    for (const [d, m] of taskLoad(t, input.today, input.calendar)) assigned.set(d, (assigned.get(d) ?? 0) + m);
  }
  const days = [...capacity.keys()].map((date) => ({ date, capacityMinutes: capacity.get(date) ?? 0, assignedMinutes: assigned.get(date) ?? 0 }));
  const capacityMinutes = days.reduce((s, d) => s + d.capacityMinutes, 0);
  const assignedMinutes = days.reduce((s, d) => s + d.assignedMinutes, 0);
  const loadPercent = capacityMinutes > 0 ? Math.round((assignedMinutes * 100) / capacityMinutes) : null;
  const level = loadPercent === null ? (assignedMinutes > 0 ? "over" : "light") : loadPercent > 100 ? "over" : loadPercent < LIGHT_BELOW ? "light" : "ok";
  return { days, capacityMinutes, assignedMinutes, loadPercent, level };
}
