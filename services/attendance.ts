// Attendance (plan/4-hr-module.md, HR slice 2; D76): check in and out with where you're working, today's presence
// board, and a monthly summary. Flags (late, short) are for the person first. HR and the owner can record or correct a
// day, always with a reason, and see everyone's months. Rough location is kept only for the person, HR and the owner.

import { addDays, endOfMonth, istDate, istInstant, type IsoDate } from "@/lib/dates";
import { toCsv } from "@/lib/csv";
import { formatTime } from "@/lib/format";
import { isId, newId } from "@/lib/id";
import { conflict, forbidden, invalid, notFound, ok, type Result } from "@/lib/result";
import type { AttendanceLocation } from "@/lib/types";
import { checkInSchema, checkOutSchema, recordAttendanceSchema, removeAttendanceSchema } from "@/lib/validation/attendance";
import { parse } from "@/lib/validation/common";
import type { AttendanceRecord, DataStore, NewEvent, PersonRecord, Repositories } from "@/repositories";
import { change, commit, noChange } from "./change";
import type { Clock } from "./clock";
import { can, type Actor } from "./permissions";
import { attendanceMonth, isLate, keepsAttendance as keeps, type DayContext, type MonthCounts, type SummaryDay } from "./rules/attendance";
import { leaveOnDays } from "./rules/leave";
import { DEFAULT_WORK_WEEK, isWorkingDay, type WorkWeek } from "./rules/working-days";

/** How far back someone may close a day they forgot to check out of. */
const SELF_FIX_DAYS = 7;

export type PresenceStatus = "in" | "left" | "leave" | "not_in" | "off";

export type PresenceRow = {
  personId: string;
  fullName: string;
  departmentName: string | null;
  status: PresenceStatus;
  location: AttendanceLocation | null;
  /** Check-in and check-out times: only on your own row, or for HR and the owner (they'd show who was late, D76). */
  since: Date | null;
  until: Date | null;
  /** Half a day of leave today. */
  halfLeave: boolean;
};

export type MyAttendance = {
  record: (AttendanceRecord & { late: boolean }) | null;
  /** Earlier days still open (checked in, never out), to close. */
  openDays: AttendanceRecord[];
  /** A working day for me (not a holiday, day off or full day of leave): My Day asks me to check in only then. */
  expected: boolean;
};

export type TodayView = {
  today: IsoDate;
  working: boolean;
  holiday: string | null;
  me: MyAttendance;
  /** Freelancers keep their own hours and don't check in. */
  keepsAttendance: boolean;
  board: PresenceRow[];
  canManage: boolean;
};

export type MonthView = {
  person: { id: string; fullName: string };
  /** False for freelancers: they keep their own hours, so there is no month to show. */
  keepsAttendance: boolean;
  month: string;
  days: Array<SummaryDay & { note: string | null; corrected: boolean; lat: number | null; lng: number | null }>;
  counts: MonthCounts;
  canManage: boolean;
};

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** People who keep attendance: active, and not freelancers (they keep their own hours). */
const keepsAttendance = (p: PersonRecord) => p.status === "active" && keeps(p.employmentType);

export function createAttendanceService(deps: { store: DataStore; clock: Clock }) {
  const { store, clock } = deps;

  async function calendar(repos: Repositories, from: IsoDate, to: IsoDate) {
    const [week, holidays] = await Promise.all([repos.calendar.getSetting<WorkWeek>("work_week"), repos.calendar.listHolidays(from, to)]);
    return { week: week ?? DEFAULT_WORK_WEEK, holidays: new Set(holidays.map((h) => h.date)), names: new Map(holidays.map((h) => [h.date, h.name])) };
  }

  /** Whether a day is a working day for this person, and any leave they have on it. */
  async function dayContext(repos: Repositories, personId: string, date: IsoDate): Promise<DayContext> {
    const [cal, leave] = await Promise.all([
      calendar(repos, date, date),
      repos.leave.listRequests({ personIds: [personId], statuses: ["approved"], overlapping: { from: date, to: date } }),
    ]);
    return { working: isWorkingDay(date, cal.week, cal.holidays), leave: leaveOnDays(leave, date, date).get(date) ?? null };
  }

  const event = (actor: Actor, r: { id: string; personId: string }, action: string, data: Record<string, unknown>): NewEvent => ({
    actorId: actor.personId,
    action,
    entityType: "attendance_day",
    entityId: r.id,
    personId: r.personId,
    data,
  });

  const service = {
    /** The home of attendance: my check-in, and who is where today. Everyone sees the board (like the leave calendar, D18). */
    async today(actor: Actor): Promise<Result<TodayView>> {
      const today = clock.today();
      const seesTimes = can(actor, "attendance.read.all");
      const [people, records, leave, cal, openDays] = await Promise.all([
        store.people.listActive(),
        store.attendance.list({ from: today, to: today }),
        store.leave.listRequests({ statuses: ["approved"], overlapping: { from: today, to: today } }),
        calendar(store, today, today),
        store.attendance.listOpen(actor.personId, today, SELF_FIX_DAYS),
      ]);
      const working = isWorkingDay(today, cal.week, cal.holidays);
      const leaveOn = (personId: string) => leaveOnDays(leave.filter((l) => l.personId === personId), today, today).get(today) ?? null;
      const board = people
        .filter(keepsAttendance)
        .map((p): PresenceRow => {
          const r = records.find((x) => x.personId === p.id);
          const away = leaveOn(p.id)?.amount ?? 0;
          const status: PresenceStatus = r ? (r.checkOutAt ? "left" : "in") : away === 1 ? "leave" : working ? "not_in" : "off";
          const times = p.id === actor.personId || seesTimes;
          return {
            personId: p.id,
            fullName: p.fullName,
            departmentName: p.departmentName,
            status,
            location: r?.location ?? null,
            since: times ? (r?.checkInAt ?? null) : null,
            until: times ? (r?.checkOutAt ?? null) : null,
            halfLeave: away === 0.5,
          };
        });
      const order: Record<PresenceStatus, number> = { in: 0, left: 1, leave: 2, not_in: 3, off: 4 };
      board.sort((a, b) => order[a.status] - order[b.status] || a.fullName.localeCompare(b.fullName));
      const mine = records.find((x) => x.personId === actor.personId) ?? null;
      const day: DayContext = { working, leave: leaveOn(actor.personId) };
      return ok({
        today,
        working,
        holiday: cal.names.get(today) ?? null,
        me: {
          record: mine ? { ...mine, late: isLate(mine.checkInAt, actor.employmentType, day) } : null,
          openDays: openDays.filter((d) => d.workDate >= addDays(today, -SELF_FIX_DAYS)),
          expected: working && day.leave?.amount !== 1,
        },
        keepsAttendance: keeps(actor.employmentType),
        board,
        canManage: can(actor, "attendance.manage"),
      });
    },

    /** Just my check-in, for My Day (cheap: no board, one round of queries). Null when I don't keep attendance. */
    async my(actor: Actor): Promise<Result<MyAttendance | null>> {
      // The actor is always a current team member (sign-in refuses leavers), so only freelancers step out here.
      if (!keeps(actor.employmentType)) return ok(null);
      const today = clock.today();
      const [record, openDays, day] = await Promise.all([
        store.attendance.findDay(actor.personId, today),
        store.attendance.listOpen(actor.personId, today, SELF_FIX_DAYS),
        dayContext(store, actor.personId, today),
      ]);
      return ok({
        record: record ? { ...record, late: isLate(record.checkInAt, actor.employmentType, day) } : null,
        openDays: openDays.filter((d) => d.workDate >= addDays(today, -SELF_FIX_DAYS)),
        expected: day.working && day.leave?.amount !== 1,
      });
    },

    async checkIn(actor: Actor, raw: unknown): Promise<Result<{ id: string; late: boolean }>> {
      const parsed = parse(checkInSchema, raw);
      if (!parsed.ok) return parsed;
      const now = clock.now();
      const today = istDate(now);
      const day = await dayContext(store, actor.personId, today);
      return commit(store, async (repos) => {
        // One check-in a day; the row lock on the person keeps a double tap from making two.
        const me = await repos.people.lockForUpdate(actor.personId);
        if (!me || !keepsAttendance(me)) return forbidden("Only current team members check in (freelancers keep their own hours).");
        const existing = await repos.attendance.findDay(actor.personId, today);
        if (existing && !existing.checkOutAt) return conflict(`You checked in at ${formatTime(existing.checkInAt)} today.`);
        if (existing?.checkOutAt) {
          // Back after checking out (test report M1): the day opens again, and the time away isn't counted as worked.
          const away = Math.max(0, Math.round((now.getTime() - existing.checkOutAt.getTime()) / 60_000));
          await repos.attendance.update(existing.id, { checkOutAt: null, awayMinutes: existing.awayMinutes + away });
          return change({ id: existing.id, late: false }, event(actor, existing, "attendance.checked_in_again", { workDate: today, awayMinutes: away }));
        }
        const id = newId();
        const { lat, lng, ...rest } = parsed.value;
        await repos.attendance.create(id, { personId: actor.personId, workDate: today, ...rest, checkInAt: now, checkOutAt: null, awayMinutes: 0, latMilli: lat, lngMilli: lng, correctedById: null, correctionReason: null });
        const late = isLate(now, me.employmentType, day);
        return change({ id, late }, event(actor, { id, personId: actor.personId }, "attendance.checked_in", { location: rest.location, workDate: today }));
      });
    },

    /** Check out today now, or close an earlier open day with the time you left (within a week). */
    async checkOut(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      const parsed = parse(checkOutSchema, raw);
      if (!parsed.ok) return parsed;
      const now = clock.now();
      const today = istDate(now);
      const workDate = parsed.value.workDate ?? today;
      if (workDate > today) return invalid("That day hasn't come yet.");
      if (workDate < addDays(today, -SELF_FIX_DAYS)) return conflict("That's more than a week ago. Ask HR to correct it.");
      return commit(store, async (repos) => {
        // The same lock as check-in and HR's corrections: a double tap or a correction at the same moment waits.
        await repos.people.lockForUpdate(actor.personId);
        const r = await repos.attendance.findDay(actor.personId, workDate);
        if (!r) return notFound("A check-in for that day");
        if (r.checkOutAt) return conflict(`You already checked out at ${formatTime(r.checkOutAt)}.`);
        let out = now;
        if (workDate !== today) {
          if (!parsed.value.time) return invalid("Enter the time you left.", { time: ["Enter the time you left."] });
          out = istInstant(workDate, parsed.value.time);
        }
        if (out <= r.checkInAt) return invalid("That's before you checked in.", { time: ["That's before you checked in."] });
        await repos.attendance.update(r.id, { checkOutAt: out });
        return change({ id: r.id }, event(actor, r, "attendance.checked_out", { workDate, late: workDate !== today }));
      });
    },

    /** A person's month: their own, or anyone's for HR and the owner. */
    async month(actor: Actor, opts: { personId?: string; month?: string } = {}): Promise<Result<MonthView>> {
      const personId = opts.personId ?? actor.personId;
      if (personId !== actor.personId && !can(actor, "attendance.read.all")) return forbidden("You can see your own attendance.");
      if (!isId(personId)) return notFound("That person");
      const today = clock.today();
      const month = opts.month ?? today.slice(0, 7);
      if (!MONTH.test(month)) return invalid("Pick a month.");
      const person = await store.people.findById(personId);
      if (!person) return notFound("That person");
      const from = `${month}-01`;
      const to = endOfMonth(from);
      if (!keeps(person.employmentType)) {
        const counts: MonthCounts = { workingDays: 0, present: { office: 0, home: 0, client_site: 0 }, leaveDays: 0, absent: 0, late: 0, short: 0, open: 0 };
        return ok({ person: { id: person.id, fullName: person.fullName }, keepsAttendance: false, month, days: [], counts, canManage: can(actor, "attendance.manage") });
      }
      const [records, leave, cal] = await Promise.all([
        store.attendance.list({ personIds: [personId], from, to }),
        store.leave.listRequests({ personIds: [personId], statuses: ["approved"], overlapping: { from, to } }),
        calendar(store, from, to),
      ]);
      const summary = attendanceMonth({
        from,
        to,
        today,
        week: cal.week,
        holidays: cal.holidays,
        leave: leaveOnDays(leave, from, to),
        records: new Map(records.map((r) => [r.workDate, r])),
        employmentType: person.employmentType,
        joinDate: person.joinDate,
        endDate: person.endDate,
      });
      return ok({
        person: { id: person.id, fullName: person.fullName },
        keepsAttendance: true,
        month,
        days: summary.days.map((d) => {
          const r = records.find((x) => x.workDate === d.date);
          return { ...d, note: r?.note ?? null, corrected: Boolean(r?.correctedById), lat: r?.latMilli != null ? r.latMilli / 1000 : null, lng: r?.lngMilli != null ? r.lngMilli / 1000 : null };
        }),
        counts: summary.counts,
        canManage: can(actor, "attendance.manage"),
      });
    },

    /** Everyone's month at a glance (HR and the owner). */
    async team(actor: Actor, month?: string): Promise<Result<{ month: string; rows: Array<{ personId: string; fullName: string; departmentName: string | null; counts: MonthCounts }> }>> {
      if (!can(actor, "attendance.read.all")) return forbidden("Only HR and the owner see everyone's attendance.");
      const today = clock.today();
      const m = month ?? today.slice(0, 7);
      if (!MONTH.test(m)) return invalid("Pick a month.");
      const from = `${m}-01`;
      const to = endOfMonth(from);
      // Everyone employed during the month, leavers included (their last month matters most), freelancers aside.
      const people = (await store.people.listAll()).filter((p) => keeps(p.employmentType) && p.joinDate <= to && (!p.endDate || p.endDate >= from));
      const [records, leave, cal] = await Promise.all([
        store.attendance.list({ personIds: people.map((p) => p.id), from, to }),
        store.leave.listRequests({ statuses: ["approved"], overlapping: { from, to } }),
        calendar(store, from, to),
      ]);
      const rows = people.map((p) => {
        const { counts } = attendanceMonth({
          from,
          to,
          today,
          week: cal.week,
          holidays: cal.holidays,
          leave: leaveOnDays(leave.filter((l) => l.personId === p.id), from, to),
          records: new Map(records.filter((r) => r.personId === p.id).map((r) => [r.workDate, r])),
          employmentType: p.employmentType,
          joinDate: p.joinDate,
          endDate: p.endDate,
        });
        return { personId: p.id, fullName: p.fullName, departmentName: p.departmentName, counts };
      });
      rows.sort((a, b) => b.counts.absent - a.counts.absent || a.fullName.localeCompare(b.fullName));
      return ok({ month: m, rows });
    },

    /**
     * The month for payroll (HR slice 3, plan/4 "the Zoho boundary"): per person, working days, days present, paid and
     * unpaid leave (working days only, half days as 0.5), days absent, and loss-of-pay days (unpaid leave + absent).
     * A CSV file today; a direct Zoho connection later reads the same rows.
     */
    async payroll(actor: Actor, month?: string): Promise<Result<{ month: string; csv: string; rows: number }>> {
      if (!can(actor, "attendance.read.all") || !can(actor, "leave.read.all")) return forbidden("Only HR and the owner export payroll.");
      const base = await service.team(actor, month);
      if (!base.ok) return base;
      const m = base.value.month;
      const from = `${m}-01`;
      const to = endOfMonth(from);
      const [leave, types, cal, people, records] = await Promise.all([
        store.leave.listRequests({ statuses: ["approved"], overlapping: { from, to } }),
        store.leave.listTypes(),
        calendar(store, from, to),
        store.people.listAll(),
        store.attendance.list({ personIds: base.value.rows.map((r) => r.personId), from, to }),
      ]);
      const today = clock.today();
      const checkedIn = new Set(records.map((r) => `${r.personId}:${r.workDate}`));
      const unpaid = new Set(types.filter((t) => !t.usesBalance).map((t) => t.id));
      const byId = new Map(people.map((p) => [p.id, p]));
      const lines = base.value.rows
        .sort((a, b) => a.fullName.localeCompare(b.fullName))
        .map((r) => {
          let paid = 0;
          let unpaidDays = 0;
          const p = byId.get(r.personId);
          // The same days as the other columns: while employed, up to today, and not a day they came in.
          const first = p && p.joinDate > from ? p.joinDate : from;
          const lastDay = [to, today, p?.endDate ?? to].sort()[0]!;
          for (const l of leave.filter((x) => x.personId === r.personId)) {
            for (const [day, d] of leaveOnDays([l], first, lastDay)) {
              if (!isWorkingDay(day, cal.week, cal.holidays) || checkedIn.has(`${r.personId}:${day}`)) continue;
              if (unpaid.has(l.leaveTypeId)) unpaidDays += d.amount;
              else paid += d.amount;
            }
          }
          const present = Object.values(r.counts.present).reduce((n, x) => n + x, 0);
          return [r.fullName, p?.workEmail ?? "", r.departmentName ?? "", p?.employmentType ?? "", r.counts.workingDays, present, paid, unpaidDays, r.counts.absent, unpaidDays + r.counts.absent, r.counts.late];
        });
      const csv = toCsv(["Name", "Work email", "Department", "Type", "Working days", "Days present", "Paid leave", "Unpaid leave", "Absent", "Loss of pay days", "Late arrivals"], lines);
      return ok({ month: m, csv, rows: lines.length });
    },

    /** HR or the owner records or corrects a day, with a reason (kept on the record and in the history). */
    async record(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "attendance.manage")) return forbidden("Only HR and the owner correct attendance.");
      const parsed = parse(recordAttendanceSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      if (v.workDate > clock.today()) return invalid("That day hasn't come yet.", { workDate: ["Pick today or an earlier day."] });
      // Times that haven't happened yet can't be recorded (test report H3).
      const now = clock.now();
      if (istInstant(v.workDate, v.inTime) > now) return invalid("Check-in can't be later than now.", { inTime: ["Check-in can't be later than now."] });
      if (v.outTime && istInstant(v.workDate, v.outTime) > now) return invalid(`Check-out can't be later than now (${formatTime(now)}). Leave it empty if they're still here.`, { outTime: ["Check-out can't be later than now."] });
      return commit(store, async (repos) => {
        const person = await repos.people.lockForUpdate(v.personId);
        if (!person) return notFound("That person");
        if (person.id === actor.personId && !actor.roles.includes("owner")) return forbidden("Ask the owner to correct your own attendance.");
        if (!keeps(person.employmentType)) return invalid("Freelancers keep their own hours; there's no attendance to record.");
        if (v.workDate < person.joinDate || (person.endDate && v.workDate > person.endDate)) {
          return invalid("They didn't work here on that day.", { workDate: ["Pick a day while they worked here."] });
        }
        const fields = {
          location: v.location,
          checkInAt: istInstant(v.workDate, v.inTime),
          checkOutAt: v.outTime ? istInstant(v.workDate, v.outTime) : null,
          // A correction sets the whole day: first in, last out.
          awayMinutes: 0,
          note: v.note,
          correctedById: actor.personId,
          correctionReason: v.reason,
        };
        const before = await repos.attendance.findDay(person.id, v.workDate);
        if (before) {
          const same = before.location === fields.location && +before.checkInAt === +fields.checkInAt && +(before.checkOutAt ?? 0) === +(fields.checkOutAt ?? 0) && before.note === fields.note;
          if (same) return noChange({ id: before.id });
          await repos.attendance.update(before.id, fields);
          return change({ id: before.id }, event(actor, before, "attendance.corrected", { workDate: v.workDate, reason: v.reason, from: { location: before.location, in: formatTime(before.checkInAt), out: before.checkOutAt ? formatTime(before.checkOutAt) : null } }));
        }
        const id = newId();
        await repos.attendance.create(id, { personId: person.id, workDate: v.workDate, ...fields, latMilli: null, lngMilli: null });
        return change({ id }, event(actor, { id, personId: person.id }, "attendance.recorded", { workDate: v.workDate, reason: v.reason }));
      });
    },

    /** HR or the owner removes a day recorded by mistake (soft, with a reason). */
    async remove(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "attendance.manage")) return forbidden("Only HR and the owner correct attendance.");
      const parsed = parse(removeAttendanceSchema, raw);
      if (!parsed.ok) return parsed;
      return commit(store, async (repos) => {
        if (parsed.value.personId === actor.personId && !actor.roles.includes("owner")) return forbidden("Ask the owner to correct your own attendance.");
        const r = await repos.attendance.findDay(parsed.value.personId, parsed.value.workDate);
        if (!r) return notFound("Attendance for that day");
        await repos.attendance.update(r.id, { deletedAt: clock.now() });
        return change({ id: r.id }, event(actor, r, "attendance.removed", { workDate: r.workDate, reason: parsed.value.reason }));
      });
    },
  };
  return service;
}

export type AttendanceService = ReturnType<typeof createAttendanceService>;
