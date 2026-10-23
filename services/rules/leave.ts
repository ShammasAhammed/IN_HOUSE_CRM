// Leave rules (decisions D39–D48). Pure functions, fully unit-tested.
// Amounts are whole half-days: 1 day = 2. A half-day request on a working day = 1.

import { addDays, eachDay, maxDate, minDate, yearOf, type IsoDate } from "@/lib/dates";
import type { HalfDay, LeaveStatus, Role } from "@/lib/types";
import { isWorkingDay, type WorkWeek } from "./working-days";

export type Calendar = { week: WorkWeek; holidays: ReadonlySet<IsoDate> };

export type LeaveSpan = {
  startDate: IsoDate;
  endDate: IsoDate;
  halfDay: HalfDay | null;
  /** Approved leave cut short: days from here on don't count. */
  cancelledFrom: IsoDate | null;
};

/** The last day that still counts, or null when nothing is left. */
export function effectiveEnd(span: LeaveSpan): IsoDate | null {
  if (!span.cancelledFrom) return span.endDate;
  if (span.cancelledFrom <= span.startDate) return null;
  return minDate(span.endDate, addDays(span.cancelledFrom, -1));
}

/** Working days the leave covers. Weekends, off-Saturdays and holidays don't count (D45). */
export function leaveDays(span: LeaveSpan, calendar: Calendar): IsoDate[] {
  const end = effectiveEnd(span);
  if (!end) return [];
  return eachDay(span.startDate, end).filter((d) => isWorkingDay(d, calendar.week, calendar.holidays));
}

/** Half-days of leave, optionally only those inside [from, to]. */
export function halfDaysIn(span: LeaveSpan, calendar: Calendar, range?: { from: IsoDate; to: IsoDate }): number {
  const days = leaveDays(span, calendar).filter((d) => !range || (d >= range.from && d <= range.to));
  return days.length * (span.halfDay ? 1 : 2);
}

/** A leave crossing 31 December is charged to each year by its own days (D41). */
export function halfDaysByYear(span: LeaveSpan, calendar: Calendar): Map<number, number> {
  const out = new Map<number, number>();
  for (const d of leaveDays(span, calendar)) out.set(yearOf(d), (out.get(yearOf(d)) ?? 0) + (span.halfDay ? 1 : 2));
  return out;
}

const yearRange = (year: number) => ({ from: `${year}-01-01`, to: `${year}-12-31` });

/**
 * The year's quota for someone who joined on `joinDate` (D40): full if they joined before the year; otherwise
 * prorated by months remaining, counting the join month only if they joined on or before the 15th.
 * Rounded to the nearest half day.
 */
export function proratedQuota(input: { quotaHalfDays: number; joinDate: IsoDate; year: number }): number {
  const joinYear = yearOf(input.joinDate);
  if (joinYear < input.year) return input.quotaHalfDays;
  if (joinYear > input.year) return 0;
  const month = Number(input.joinDate.slice(5, 7));
  const day = Number(input.joinDate.slice(8, 10));
  const months = 12 - month + (day <= 15 ? 1 : 0);
  return Math.round((input.quotaHalfDays * months) / 12);
}

export type Grant = { halfDays: number; grantedOn: IsoDate; expiresOn: IsoDate | null };
export type LeaveOnRecord = LeaveSpan & { status: LeaveStatus };

export type LeaveBalance = {
  /** Quota for the year (0 for granted-only types like comp-off). */
  entitledHalfDays: number;
  /** Grants and HR adjustments that count this year (comp-off: all still valid today). */
  grantedHalfDays: number;
  /** Approved leave, taken or booked, in the year. */
  usedHalfDays: number;
  /** Waiting for approval, in the year. Pending requests reserve balance (D46). */
  pendingHalfDays: number;
  /** Null when the type has no balance (unpaid). */
  availableHalfDays: number | null;
  /** The next comp-off grant to lapse with some of it unused. */
  expiring: { halfDays: number; on: IsoDate } | null;
};

const counts = (status: LeaveStatus) => status === "approved" || status === "pending";

export function leaveBalance(input: {
  year: number;
  today: IsoDate;
  type: { usesBalance: boolean; grantedOnly: boolean };
  quotaHalfDays: number;
  joinDate: IsoDate;
  grants: Grant[];
  requests: LeaveOnRecord[];
  calendar: Calendar;
}): LeaveBalance {
  const range = yearRange(input.year);
  const used = input.requests.filter((r) => r.status === "approved").reduce((s, r) => s + halfDaysIn(r, input.calendar, range), 0);
  const pending = input.requests.filter((r) => r.status === "pending").reduce((s, r) => s + halfDaysIn(r, input.calendar, range), 0);

  if (!input.type.usesBalance) {
    return { entitledHalfDays: 0, grantedHalfDays: 0, usedHalfDays: used, pendingHalfDays: pending, availableHalfDays: null, expiring: null };
  }

  if (input.type.grantedOnly) {
    const pool = compOffPool(input.grants, input.requests.filter((r) => counts(r.status)), input.calendar, input.today);
    return {
      entitledHalfDays: 0,
      grantedHalfDays: pool.validGranted,
      usedHalfDays: used,
      pendingHalfDays: pending,
      availableHalfDays: pool.available,
      expiring: pool.expiring,
    };
  }

  const entitled = proratedQuota({ quotaHalfDays: input.quotaHalfDays, joinDate: input.joinDate, year: input.year });
  const adjustments = input.grants
    .filter((g) => g.grantedOn >= range.from && g.grantedOn <= range.to)
    .reduce((s, g) => s + g.halfDays, 0);
  return {
    entitledHalfDays: entitled,
    grantedHalfDays: adjustments,
    usedHalfDays: used,
    pendingHalfDays: pending,
    availableHalfDays: entitled + adjustments - used - pending,
    expiring: null,
  };
}

/**
 * Comp-off: each use is paid from a grant that is valid on the leave date, earliest-expiring first.
 * What remains on grants still valid today is available. Negative grants (HR corrections) are uses on the grant date.
 */
function compOffPool(grants: Grant[], requests: LeaveOnRecord[], calendar: Calendar, today: IsoDate) {
  const pool = grants
    .filter((g) => g.halfDays > 0)
    .map((g) => ({ ...g, remaining: g.halfDays }))
    .sort((a, b) => (a.expiresOn ?? "9999-12-31").localeCompare(b.expiresOn ?? "9999-12-31") || a.grantedOn.localeCompare(b.grantedOn));

  const uses: Array<{ date: IsoDate; halfDays: number }> = [
    ...grants.filter((g) => g.halfDays < 0).map((g) => ({ date: g.grantedOn, halfDays: -g.halfDays })),
    ...requests.flatMap((r) => leaveDays(r, calendar).map((date) => ({ date, halfDays: r.halfDay ? 1 : 2 }))),
  ].sort((a, b) => a.date.localeCompare(b.date));

  for (const use of uses) {
    let left = use.halfDays;
    for (const g of pool) {
      if (left === 0) break;
      const valid = g.grantedOn <= use.date && (!g.expiresOn || use.date <= g.expiresOn);
      if (!valid || g.remaining === 0) continue;
      const take = Math.min(g.remaining, left);
      g.remaining -= take;
      left -= take;
    }
  }

  const valid = pool.filter((g) => !g.expiresOn || g.expiresOn >= today);
  const next = valid.find((g) => g.remaining > 0 && g.expiresOn);
  return {
    validGranted: valid.reduce((s, g) => s + g.halfDays, 0),
    available: valid.reduce((s, g) => s + g.remaining, 0),
    expiring: next && next.expiresOn ? { halfDays: next.remaining, on: next.expiresOn } : null,
  };
}

/** Do two leaves share at least one day? (Used for clash warnings and double-booking checks.) */
export function overlaps(a: LeaveSpan, b: LeaveSpan): boolean {
  const aEnd = effectiveEnd(a);
  const bEnd = effectiveEnd(b);
  if (!aEnd || !bEnd) return false;
  // A morning and an afternoon on the same day don't overlap.
  if (a.halfDay && b.halfDay && a.halfDay !== b.halfDay && a.startDate === b.startDate) return false;
  return maxDate(a.startDate, b.startDate) <= minDate(aEnd, bEnd);
}

/**
 * Who decides a request (D42): the person's manager if active; otherwise the owner.
 * The owner's own leave approves itself.
 */
export function approverFor(input: {
  requester: { id: string; roles: readonly Role[]; reportsToId: string | null };
  activePeopleIds: ReadonlySet<string>;
  ownerIds: readonly string[];
}): { approverId: string | null; autoApprove: boolean } {
  if (input.requester.roles.includes("owner")) return { approverId: input.requester.id, autoApprove: true };
  const manager = input.requester.reportsToId;
  if (manager && manager !== input.requester.id && input.activePeopleIds.has(manager)) return { approverId: manager, autoApprove: false };
  const owner = input.ownerIds.find((id) => id !== input.requester.id) ?? null;
  return { approverId: owner, autoApprove: false };
}

export type CancelOutcome =
  | { kind: "cancel" }
  | { kind: "request_cut_short"; from: IsoDate }
  | { kind: "not_allowed"; message: string };

/**
 * What cancelling does (D43): pending, or approved and not started → cancelled at once.
 * Approved and already started → ask the approver to cut it short from tomorrow.
 */
export function cancelOutcome(request: LeaveOnRecord, today: IsoDate): CancelOutcome {
  if (request.status === "pending") return { kind: "cancel" };
  if (request.status !== "approved") return { kind: "not_allowed", message: "Only pending or approved leave can be cancelled." };
  if (request.startDate > today) return { kind: "cancel" };
  const end = effectiveEnd(request);
  if (!end || end <= today) return { kind: "not_allowed", message: "This leave has already been taken, so it can't be cancelled." };
  return { kind: "request_cut_short", from: addDays(today, 1) };
}

/** "1 day", "2.5 days" from half-days. */
export function daysLabel(halfDays: number): string {
  const days = halfDays / 2;
  return `${days.toLocaleString("en-IN")} ${Math.abs(days) === 1 ? "day" : "days"}`;
}

/** Days of approved leave inside [from, to]: a full day = 1, a half day = 0.5 (for capacity and time gaps). */
export function leaveByDay(spans: readonly LeaveSpan[], from: IsoDate, to: IsoDate): Map<IsoDate, 0.5 | 1> {
  return new Map([...leaveOnDays(spans, from, to)].map(([d, l]) => [d, l.amount]));
}

export type DayLeave = { amount: 0.5 | 1; half: HalfDay | null };

/** Like leaveByDay, also saying which half a half day is (attendance: no "late" when the morning is leave). */
export function leaveOnDays(spans: readonly LeaveSpan[], from: IsoDate, to: IsoDate): Map<IsoDate, DayLeave> {
  const out = new Map<IsoDate, DayLeave>();
  for (const r of spans) {
    const end = effectiveEnd(r);
    if (!end) continue;
    for (const d of eachDay(maxDate(r.startDate, from), minDate(end, to))) out.set(d, { amount: r.halfDay ? 0.5 : 1, half: r.halfDay });
  }
  return out;
}
