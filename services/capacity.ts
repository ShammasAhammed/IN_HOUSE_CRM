// The Week view (plan/3-projects-module.md, decision D33): assigned hours against each person's real capacity
// (weekly hours, minus holidays and approved leave), plus what they actually logged.

import { addDays, eachDay, isIsoDate, startOfWeek, type IsoDate } from "@/lib/dates";
import { invalid, ok, type Result } from "@/lib/result";
import type { EmploymentType, Role } from "@/lib/types";
import type { DataStore } from "@/repositories";
import type { Clock } from "./clock";
import { can, everything, type Actor } from "./permissions";
import { weekLoad, type WeekLoad } from "./rules/capacity";
import { leaveByDay } from "./rules/leave";
import { DEFAULT_WORK_WEEK, isWorkingDay, type WorkWeek } from "./rules/working-days";

export type WeekRow = WeekLoad & {
  personId: string;
  personName: string;
  roles: Role[];
  employmentType: EmploymentType;
  departmentName: string | null;
  /** Days (or half days) of approved leave this week. */
  leave: Record<IsoDate, 0.5 | 1>;
  loggedMinutes: number;
  /** Open tasks in this week's window (due this week, overdue, or running through it), not all they own. */
  openTasks: number;
};

export type WeekView = {
  weekStart: IsoDate;
  days: Array<{ date: IsoDate; working: boolean; holiday: string | null }>;
  rows: WeekRow[];
  /** Everyone (planners) or just the viewer. */
  everyone: boolean;
};

export function createCapacityService(deps: { store: DataStore; clock: Clock }) {
  const { store, clock } = deps;

  return {
    async week(actor: Actor, start?: string): Promise<Result<WeekView>> {
      const today = clock.today();
      if (start !== undefined && !isIsoDate(start)) return invalid("Pick a week.");
      const weekStart = startOfWeek(start ?? today);
      const weekEnd = addDays(weekStart, 6);
      // Planning the agency's load is for people who see all work; everyone else sees their own week.
      const everyone = can(actor, "tasks.read.all");

      const [people, tasks, leave, holidays, workWeek, logged] = await Promise.all([
        store.people.listActive(),
        // Private spaces they aren't in stay out of the plan (Stage 14.1).
        store.tasks.list({ scope: everyone ? everything(actor) : { kind: "own", personId: actor.personId }, forWeek: { from: weekStart, to: weekEnd } }),
        // Only the leave of the rows shown: everyone's for planners, your own otherwise.
        store.leave.listRequests({ ...(everyone ? {} : { personIds: [actor.personId] }), statuses: ["approved"], overlapping: { from: weekStart, to: weekEnd } }),
        store.calendar.listHolidays(weekStart, weekEnd),
        store.calendar.getSetting<WorkWeek>("work_week"),
        store.time.totalsByPersonDay(everyone ? [] : [actor.personId], weekStart, weekEnd),
      ]);
      const team = people.filter((p) => (everyone ? true : p.id === actor.personId));
      const allLogged = everyone ? await store.time.totalsByPersonDay(team.map((p) => p.id), weekStart, weekEnd) : logged;
      const calendar = { week: workWeek ?? DEFAULT_WORK_WEEK, holidays: new Set(holidays.map((h) => h.date)) };

      const rows = team.map((p): WeekRow => {
        const leaveDays = leaveByDay(leave.filter((l) => l.personId === p.id), weekStart, weekEnd);
        const mine = tasks.filter((t) => t.ownerId === p.id);
        const load = weekLoad({ weekStart, today, weeklyMinutes: p.capacityMinutesPerWeek, leave: leaveDays, tasks: mine, calendar, joinDate: p.joinDate, endDate: p.endDate });
        return {
          ...load,
          personId: p.id,
          personName: p.fullName,
          roles: p.roles,
          employmentType: p.employmentType,
          departmentName: p.departmentName,
          leave: Object.fromEntries(leaveDays),
          loggedMinutes: allLogged.filter((l) => l.personId === p.id).reduce((s, l) => s + l.minutes, 0),
          openTasks: mine.filter((t) => t.status !== "done").length,
        };
      });
      // People who do client work first, most loaded first.
      rows.sort((a, b) => (b.loadPercent ?? -1) - (a.loadPercent ?? -1) || a.personName.localeCompare(b.personName));

      return ok({
        weekStart,
        days: eachDay(weekStart, weekEnd).map((date) => ({
          date,
          working: isWorkingDay(date, calendar.week, calendar.holidays),
          holiday: holidays.find((h) => h.date === date)?.name ?? null,
        })),
        rows,
        everyone,
      });
    },
  };
}

export type CapacityService = ReturnType<typeof createCapacityService>;
