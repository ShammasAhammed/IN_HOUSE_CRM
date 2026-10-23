// Attendance (HR slice 2, D76). Pure rules, unit-tested.
//
// - Office hours are 9:30–18:30 India time (D32). Checking in after 9:45 is late (15 minutes' grace).
// - A day with under 7 hours between check-in and check-out is short. Late and short apply to full-time staff and
//   interns only, and only on working days; part-timers and freelancers keep their own hours. A morning of leave
//   means no "late"; a half day of leave halves the bar for "short".
// - Flags are shown to the person first; they inform a conversation, they never cut pay or leave.
// - A past working day with no record and no leave is "absent" for full-time staff and interns; for part-timers it is
//   just "not in" (they work fewer days). A client site day counts as present.

import { eachDay, istMinutesOfDay, type IsoDate } from "@/lib/dates";
import type { AttendanceLocation, EmploymentType } from "@/lib/types";
import type { DayLeave } from "./leave";
import { isWorkingDay, type WorkWeek } from "./working-days";

export const OFFICE_START_MINUTES = 9 * 60 + 30;
export const LATE_GRACE_MINUTES = 15;
export const SHORT_DAY_MINUTES = 7 * 60;

const FLAGGED: readonly EmploymentType[] = ["full_time", "intern"];

/** The day around a check-in: flags apply only on working days, and not to a morning spent on leave. */
export type DayContext = { working: boolean; leave: DayLeave | null };

export function isLate(checkInAt: Date, employmentType: EmploymentType, day: DayContext): boolean {
  if (!FLAGGED.includes(employmentType) || !day.working || day.leave?.amount === 1 || day.leave?.half === "first_half") return false;
  return istMinutesOfDay(checkInAt) > OFFICE_START_MINUTES + LATE_GRACE_MINUTES;
}

/** Minutes worked: first check-in to last check-out, less any time away in between. */
export function workedMinutes(checkInAt: Date, checkOutAt: Date | null, awayMinutes = 0): number | null {
  return checkOutAt ? Math.max(0, Math.round((checkOutAt.getTime() - checkInAt.getTime()) / 60_000) - awayMinutes) : null;
}

/** Short only when the day was checked out: an open day isn't judged. A half day of leave halves the bar. */
export function isShort(input: { checkInAt: Date; checkOutAt: Date | null; awayMinutes?: number; employmentType: EmploymentType; day: DayContext }): boolean {
  const worked = workedMinutes(input.checkInAt, input.checkOutAt, input.awayMinutes);
  if (worked === null || !FLAGGED.includes(input.employmentType) || !input.day.working || input.day.leave?.amount === 1) return false;
  return worked < (input.day.leave ? SHORT_DAY_MINUTES / 2 : SHORT_DAY_MINUTES);
}

/** Whether this person checks in at all: freelancers keep their own hours. */
export const keepsAttendance = (employmentType: EmploymentType) => employmentType !== "freelancer";

export type DayRecord = { location: AttendanceLocation; checkInAt: Date; checkOutAt: Date | null; awayMinutes?: number };

/** "today": a working day still under way with no check-in yet; "not_in": a part-timer's day without a record. */
export type DayKind = "present" | "leave" | "holiday" | "off" | "absent" | "not_in" | "today" | "upcoming" | "not_employed";

export type SummaryDay = {
  date: IsoDate;
  kind: DayKind;
  /** Half a day of leave (the other half may be worked). */
  halfLeave: boolean;
  location: AttendanceLocation | null;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  /** First in to last out, less time away; null while still in. */
  workedMinutes: number | null;
  late: boolean;
  short: boolean;
  /** Checked in but never out, on a day already over. */
  open: boolean;
};

export type MonthCounts = {
  /** Working days so far (up to and including today), while employed. */
  workingDays: number;
  present: Record<AttendanceLocation, number>;
  /** In days; half days count 0.5. */
  leaveDays: number;
  absent: number;
  late: number;
  short: number;
  open: number;
};

export function attendanceMonth(input: {
  from: IsoDate;
  to: IsoDate;
  today: IsoDate;
  week: WorkWeek;
  holidays: ReadonlySet<IsoDate>;
  leave: ReadonlyMap<IsoDate, DayLeave>;
  records: ReadonlyMap<IsoDate, DayRecord>;
  employmentType: EmploymentType;
  joinDate: IsoDate;
  endDate: IsoDate | null;
}): { days: SummaryDay[]; counts: MonthCounts } {
  const counts: MonthCounts = { workingDays: 0, present: { office: 0, home: 0, client_site: 0 }, leaveDays: 0, absent: 0, late: 0, short: 0, open: 0 };
  const days = eachDay(input.from, input.to).map((date): SummaryDay => {
    const r = input.records.get(date) ?? null;
    const dayLeave = input.leave.get(date) ?? null;
    const away = dayLeave?.amount ?? 0;
    const base = { date, halfLeave: away === 0.5, location: r?.location ?? null, checkInAt: r?.checkInAt ?? null, checkOutAt: r?.checkOutAt ?? null, workedMinutes: r ? workedMinutes(r.checkInAt, r.checkOutAt, r.awayMinutes) : null, late: false, short: false, open: false };
    if (date < input.joinDate || (input.endDate && date > input.endDate)) return { ...base, kind: "not_employed" };
    const working = isWorkingDay(date, input.week, input.holidays);
    if (working && date <= input.today) counts.workingDays++;
    if (r) {
      const day = { working, leave: dayLeave };
      const late = isLate(r.checkInAt, input.employmentType, day);
      const short = isShort({ ...r, employmentType: input.employmentType, day });
      const open = !r.checkOutAt && date < input.today;
      counts.present[r.location]++;
      if (late) counts.late++;
      if (short) counts.short++;
      if (open) counts.open++;
      if (away) counts.leaveDays += away;
      return { ...base, kind: "present", late, short, open };
    }
    if (!working) return { ...base, kind: input.holidays.has(date) ? "holiday" : "off" };
    if (away) {
      counts.leaveDays += away;
      return { ...base, kind: "leave" };
    }
    if (date > input.today) return { ...base, kind: "upcoming" };
    if (date === input.today) return { ...base, kind: "today" };
    if (!FLAGGED.includes(input.employmentType)) return { ...base, kind: "not_in" };
    counts.absent++;
    return { ...base, kind: "absent" };
  });
  return { days, counts };
}
