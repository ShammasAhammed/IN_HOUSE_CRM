// The Friday screen (plan/3-projects-module.md, "Time tracking, kept painless"): a person's week by task and day,
// with gaps highlighted, fillable in two minutes. Leads also get the team's week to see who hasn't filled theirs.

import { addDays, eachDay, isIsoDate, startOfWeek, type IsoDate } from "@/lib/dates";
import { isId, newId } from "@/lib/id";
import { conflict, forbidden, invalid, notFound, ok, type Result } from "@/lib/result";
import type { TaskStatus } from "@/lib/types";
import { parse } from "@/lib/validation/common";
import { dayTotalSchema } from "@/lib/validation/time";
import type { DataStore, NewEvent, PersonRecord, Repositories } from "@/repositories";
import { change, commit, noChange } from "./change";
import type { Clock } from "./clock";
import { can, type Actor } from "./permissions";
import { hiddenFor } from "./spaces";
import { dailyCapacity } from "./rules/capacity";
import { leaveByDay } from "./rules/leave";
import { dayFill, isTimeLocked, type DayFill } from "./rules/time";
import { DEFAULT_WORK_WEEK, isWorkingDay, type WorkWeek } from "./rules/working-days";
import { taskScope } from "./tasks";

export type TimeDay = {
  date: IsoDate;
  working: boolean;
  holiday: string | null;
  /** 1 = on leave all day, 0.5 = half a day. */
  leave: 0.5 | 1 | null;
  expectedMinutes: number;
  loggedMinutes: number;
  fill: DayFill;
  /** Closed for time (after the 5th of the next month), or in the future. */
  editable: boolean;
};

export type TimeRow = {
  taskId: string;
  title: string;
  clientName: string;
  projectName: string;
  status: TaskStatus;
  dueDate: IsoDate | null;
  minutes: Record<IsoDate, number>;
  totalMinutes: number;
};

export type TimeWeek = {
  weekStart: IsoDate;
  person: { id: string; name: string };
  /** The viewer's own week: cells can be filled. */
  mine: boolean;
  days: TimeDay[];
  rows: TimeRow[];
  expectedMinutes: number;
  loggedMinutes: number;
  /** Their other open tasks, to add a row for. */
  otherTasks: Array<{ id: string; title: string; clientName: string }>;
};

export type TeamTimeRow = { personId: string; personName: string; days: Array<Pick<TimeDay, "date" | "expectedMinutes" | "loggedMinutes" | "fill">>; expectedMinutes: number; loggedMinutes: number; gaps: number };

export function createTimeService(deps: { store: DataStore; clock: Clock }) {
  const { store, clock } = deps;

  async function calendar(repos: Repositories, from: IsoDate, to: IsoDate) {
    const [holidays, week] = await Promise.all([repos.calendar.listHolidays(from, to), repos.calendar.getSetting<WorkWeek>("work_week")]);
    return { week: week ?? DEFAULT_WORK_WEEK, holidays: new Set(holidays.map((h) => h.date)), names: new Map(holidays.map((h) => [h.date, h.name])) };
  }

  /** Each day's expected project hours (D33 capacity: weekly hours over working days, less holidays and leave) and fill. */
  function shapeDays(
    person: PersonRecord,
    weekStart: IsoDate,
    cal: Awaited<ReturnType<typeof calendar>>,
    leave: Map<IsoDate, 0.5 | 1>,
    logged: Map<IsoDate, number>,
    editableFor: (d: IsoDate) => boolean,
  ): TimeDay[] {
    const today = clock.today();
    // Before they joined or after they left, nothing is expected: the same rule as the Week screen.
    const capacity = dailyCapacity({ weeklyMinutes: person.capacityMinutesPerWeek, weekStart, calendar: cal, leave, joinDate: person.joinDate, endDate: person.endDate });
    return eachDay(weekStart, addDays(weekStart, 6)).map((date) => {
      const expectedMinutes = capacity.get(date) ?? 0;
      const loggedMinutes = logged.get(date) ?? 0;
      return {
        date,
        working: isWorkingDay(date, cal.week, cal.holidays),
        holiday: cal.names.get(date) ?? null,
        leave: leave.get(date) ?? null,
        expectedMinutes,
        loggedMinutes,
        fill: dayFill({ date, today, expectedMinutes, loggedMinutes }),
        editable: editableFor(date),
      };
    });
  }

  return {
    /** One person's week: their own, or anyone's for leads (time.read.all), read-only. */
    async week(actor: Actor, opts: { start?: string; personId?: string } = {}): Promise<Result<TimeWeek>> {
      if (opts.start !== undefined && !isIsoDate(opts.start)) return invalid("Pick a week.");
      const personId = opts.personId ?? actor.personId;
      const mine = personId === actor.personId;
      if (!mine && !can(actor, "time.read.all")) return forbidden("You can see your own time here.");
      if (!isId(personId)) return notFound("That person");
      const person = await store.people.findById(personId);
      if (!person) return notFound("That person");

      const today = clock.today();
      const weekStart = startOfWeek(opts.start ?? today);
      const weekEnd = addDays(weekStart, 6);
      const [entries, owned, leave, cal] = await Promise.all([
        store.time.list({ personId, from: weekStart, to: weekEnd }),
        store.tasks.list({ scope: { kind: "own", personId }, ownerId: personId, forWeek: { from: weekStart, to: weekEnd } }),
        store.leave.listRequests({ personIds: [personId], statuses: ["approved"], overlapping: { from: weekStart, to: weekEnd } }),
        calendar(store, weekStart, weekEnd),
      ]);

      // Rows: tasks they worked on this week, plus their own tasks that were due or running.
      const loggedOn = new Set(entries.map((e) => e.taskId));
      const missing = [...loggedOn].filter((id) => !owned.some((t) => t.id === id));
      // Subtasks included: time can be logged on them too.
      const others = missing.length ? await store.tasks.list({ scope: { kind: "all" }, ids: missing }) : [];
      // Someone else's week: tasks in private spaces this person isn't in stay out (Stage 14.1).
      const hidden = mine ? new Set<string>() : await hiddenFor(store, actor);
      const tasks = [...owned, ...others].filter((t) => !hidden.has(t.clientId));
      const rows = tasks
        .map((t): TimeRow => {
          const minutes: Record<IsoDate, number> = {};
          for (const e of entries.filter((x) => x.taskId === t.id)) minutes[e.workDate] = (minutes[e.workDate] ?? 0) + e.minutes;
          return {
            taskId: t.id,
            title: t.title,
            clientName: t.clientName,
            projectName: t.projectName,
            status: t.status,
            dueDate: t.dueDate,
            minutes,
            totalMinutes: Object.values(minutes).reduce((s, m) => s + m, 0),
          };
        })
        // Worked-on first, then open, then by due date.
        .sort((a, b) => Number(b.totalMinutes > 0) - Number(a.totalMinutes > 0) || Number(a.status === "done") - Number(b.status === "done") || (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9"));

      const logged = new Map<IsoDate, number>();
      for (const e of entries) logged.set(e.workDate, (logged.get(e.workDate) ?? 0) + e.minutes);
      const manage = can(actor, "time.manage");
      const days = shapeDays(person, weekStart, cal, leaveByDay(leave, weekStart, weekEnd), logged, (d) => mine && d <= today && (manage || !isTimeLocked(d, today)));

      const otherTasks = mine
        ? (await store.tasks.list({ scope: { kind: "own", personId }, ownerId: personId, statuses: ["todo", "in_progress", "in_review", "blocked"], limit: 60 }))
            .filter((t) => !rows.some((r) => r.taskId === t.id))
            .map((t) => ({ id: t.id, title: t.title, clientName: t.clientName }))
        : [];

      return ok({
        weekStart,
        person: { id: person.id, name: person.fullName },
        mine,
        days,
        rows,
        expectedMinutes: days.reduce((s, d) => s + d.expectedMinutes, 0),
        loggedMinutes: days.reduce((s, d) => s + d.loggedMinutes, 0),
        otherTasks,
      });
    },

    /** Everyone's week at a glance, most gaps first (time.read.all). */
    async team(actor: Actor, start?: string): Promise<Result<{ weekStart: IsoDate; days: Array<{ date: IsoDate; working: boolean; holiday: string | null }>; rows: TeamTimeRow[] }>> {
      if (!can(actor, "time.read.all")) return forbidden("Only leads see the team's time.");
      if (start !== undefined && !isIsoDate(start)) return invalid("Pick a week.");
      const today = clock.today();
      const weekStart = startOfWeek(start ?? today);
      const weekEnd = addDays(weekStart, 6);
      const people = (await store.people.listActive()).filter((p) => p.capacityMinutesPerWeek > 0 && p.employmentType !== "freelancer");
      const [totals, leave, cal] = await Promise.all([
        store.time.totalsByPersonDay(people.map((p) => p.id), weekStart, weekEnd),
        store.leave.listRequests({ statuses: ["approved"], overlapping: { from: weekStart, to: weekEnd } }),
        calendar(store, weekStart, weekEnd),
      ]);
      const rows = people
        .map((p): TeamTimeRow => {
          const logged = new Map(totals.filter((t) => t.personId === p.id).map((t) => [t.workDate, t.minutes]));
          const days = shapeDays(p, weekStart, cal, leaveByDay(leave.filter((l) => l.personId === p.id), weekStart, weekEnd), logged, () => false);
          return {
            personId: p.id,
            personName: p.fullName,
            days: days.map(({ date, expectedMinutes, loggedMinutes, fill }) => ({ date, expectedMinutes, loggedMinutes, fill })),
            expectedMinutes: days.reduce((s, d) => s + d.expectedMinutes, 0),
            loggedMinutes: days.reduce((s, d) => s + d.loggedMinutes, 0),
            gaps: days.filter((d) => d.fill === "empty" || d.fill === "short").length,
          };
        })
        .sort((a, b) => b.gaps - a.gaps || a.personName.localeCompare(b.personName));
      return ok({
        weekStart,
        days: eachDay(weekStart, weekEnd).map((date) => ({ date, working: isWorkingDay(date, cal.week, cal.holidays), holiday: cal.names.get(date) ?? null })),
        rows,
      });
    },

    /**
     * Set what you spent on a task on a day (up to 16 hours). More than before adds an entry for the difference; less
     * takes it off your newest entries for that day, keeping their notes and billable marks. Same month lock as
     * one-tap logging (D34).
     */
    async setDayTotal(actor: Actor, raw: unknown): Promise<Result<{ minutes: number; dayMinutes: number }>> {
      const parsed = parse(dayTotalSchema, raw);
      if (!parsed.ok) return parsed;
      const { taskId, workDate, hours: target } = parsed.value;
      const today = clock.today();
      if (workDate > today) return invalid("Time can't be logged for a future day.", { workDate: ["Pick today or an earlier day."] });
      if (isTimeLocked(workDate, today) && !can(actor, "time.manage")) {
        return conflict("That month is closed for time (after the 5th of the next month). Ask your lead to add it.");
      }
      return commit(store, async (repos) => {
        // Locks the person so two quick saves of the same cell queue up instead of both adding the hours.
        await repos.people.lockForUpdate(actor.personId);
        const t = await repos.tasks.findById(taskId, taskScope(actor));
        if (!t) return notFound("That task");
        const entries = (await repos.time.list({ personId: actor.personId, taskId, from: workDate, to: workDate })).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        const current = entries.reduce((s, e) => s + e.minutes, 0);
        const dayMinutes = async () => (await repos.time.list({ personId: actor.personId, from: workDate, to: workDate })).reduce((s, e) => s + e.minutes, 0);
        if (target === current) return noChange({ minutes: current, dayMinutes: await dayMinutes() });

        const events: NewEvent[] = [];
        if (target < current) {
          // Take the difference off the newest entries: whole entries go (soft), the last one shrinks in place, so the
          // rest keep their note and a lead's non-billable mark.
          let over = current - target;
          for (const e of entries) {
            if (over === 0) break;
            if (e.minutes <= over) {
              await repos.time.update(e.id, { deletedAt: clock.now() });
              over -= e.minutes;
              events.push({ actorId: actor.personId, action: "time.removed", entityType: "time_entry", entityId: e.id, clientId: e.clientId, data: { taskId, minutes: e.minutes, workDate } });
            } else {
              await repos.time.update(e.id, { minutes: e.minutes - over });
              events.push({ actorId: actor.personId, action: "time.changed", entityType: "time_entry", entityId: e.id, clientId: e.clientId, data: { taskId, from: e.minutes, to: e.minutes - over, workDate } });
              over = 0;
            }
          }
        } else {
          const id = newId();
          const minutes = target - current;
          await repos.time.add(id, {
            taskId: t.id,
            personId: actor.personId,
            clientId: t.clientId,
            engagementId: t.engagementId,
            workDate,
            minutes,
            billable: t.engagementId !== null,
            note: null,
          });
          events.push({ actorId: actor.personId, action: "time.logged", entityType: "time_entry", entityId: id, clientId: t.clientId, data: { taskId: t.id, minutes, workDate, filled: true } });
        }
        return change({ minutes: target, dayMinutes: await dayMinutes() }, ...(events as [NewEvent, ...NewEvent[]]));
      });
    },
  };
}

export type TimeService = ReturnType<typeof createTimeService>;
