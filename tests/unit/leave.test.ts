import { describe, expect, it } from "vitest";
import {
  approverFor,
  cancelOutcome,
  daysLabel,
  effectiveEnd,
  halfDaysByYear,
  halfDaysIn,
  leaveBalance,
  overlaps,
  proratedQuota,
  type Calendar,
  type LeaveOnRecord,
} from "@/services/rules/leave";
import { DEFAULT_WORK_WEEK } from "@/services/rules/working-days";

const calendar: Calendar = { week: DEFAULT_WORK_WEEK, holidays: new Set(["2026-10-20", "2026-12-25"]) };
const span = (startDate: string, endDate: string, extra: Partial<LeaveOnRecord> = {}): LeaveOnRecord => ({
  startDate,
  endDate,
  halfDay: null,
  cancelledFrom: null,
  status: "approved",
  ...extra,
});

describe("counting leave days", () => {
  it("counts working days only: Sundays, off-Saturdays and holidays are free", () => {
    // Fri 16 Oct → Wed 21 Oct 2026: Fri, Sat(3rd, working), [Sun], Mon, [Tue 20 holiday], Wed = 4 days.
    expect(halfDaysIn(span("2026-10-16", "2026-10-21"), calendar)).toBe(8);
    // Second Saturday (10 Oct) is off.
    expect(halfDaysIn(span("2026-10-09", "2026-10-12"), calendar)).toBe(4);
  });

  it("counts a half-day as one half", () => {
    expect(halfDaysIn(span("2026-10-15", "2026-10-15", { halfDay: "first_half" }), calendar)).toBe(1);
  });

  it("counts nothing when every day is already off", () => {
    expect(halfDaysIn(span("2026-10-18", "2026-10-18"), calendar)).toBe(0); // Sunday
  });

  it("splits leave across a year end by its own days", () => {
    // Wed 30 Dec 2026 → Sat 2 Jan 2027: 30, 31 Dec; 1 Jan (Fri), 2 Jan (first Saturday, working).
    const byYear = halfDaysByYear(span("2026-12-30", "2027-01-02"), calendar);
    expect(byYear.get(2026)).toBe(4);
    expect(byYear.get(2027)).toBe(4);
  });

  it("stops counting where approved leave was cut short", () => {
    const cut = span("2026-10-12", "2026-10-16", { cancelledFrom: "2026-10-15" });
    expect(effectiveEnd(cut)).toBe("2026-10-14");
    expect(halfDaysIn(cut, calendar)).toBe(6);
    expect(effectiveEnd(span("2026-10-12", "2026-10-16", { cancelledFrom: "2026-10-12" }))).toBeNull();
  });
});

describe("prorated quota (D40)", () => {
  const quota = 24; // 12 days

  it("is full for people who joined before the year", () => {
    expect(proratedQuota({ quotaHalfDays: quota, joinDate: "2024-06-10", year: 2026 })).toBe(24);
  });

  it("counts the join month when joined on or before the 15th", () => {
    expect(proratedQuota({ quotaHalfDays: quota, joinDate: "2026-07-15", year: 2026 })).toBe(12); // Jul–Dec
    expect(proratedQuota({ quotaHalfDays: quota, joinDate: "2026-07-16", year: 2026 })).toBe(10); // Aug–Dec
  });

  it("rounds to the nearest half day", () => {
    // 12 days × 5/12 = 5 days = 10 half-days; 6 days × 5/12 = 2.5 days = 5 half-days.
    expect(proratedQuota({ quotaHalfDays: 12, joinDate: "2026-08-01", year: 2026 })).toBe(5);
    // Joined 20 Sep (after the 15th): Oct–Dec = 3 months. 6 days × 3/12 = 1.5 days = 3 half-days.
    expect(proratedQuota({ quotaHalfDays: 12, joinDate: "2026-09-20", year: 2026 })).toBe(3);
  });

  it("is zero before someone joins", () => {
    expect(proratedQuota({ quotaHalfDays: quota, joinDate: "2027-02-01", year: 2026 })).toBe(0);
  });
});

describe("balances", () => {
  const base = {
    year: 2026,
    today: "2026-10-14",
    type: { usesBalance: true, grantedOnly: false },
    quotaHalfDays: 24,
    joinDate: "2025-01-01",
    grants: [],
    calendar,
  };

  it("subtracts approved and pending leave in the year", () => {
    const b = leaveBalance({
      ...base,
      requests: [
        span("2026-03-02", "2026-03-03"), // 2 days approved
        span("2026-10-22", "2026-10-22", { status: "pending" }), // 1 day pending
        span("2026-05-04", "2026-05-04", { status: "rejected" }),
        span("2026-06-01", "2026-06-02", { status: "cancelled" }),
      ],
    });
    expect(b).toMatchObject({ entitledHalfDays: 24, usedHalfDays: 4, pendingHalfDays: 2, availableHalfDays: 18 });
  });

  it("restores balance when leave is cut short", () => {
    const b = leaveBalance({ ...base, requests: [span("2026-10-12", "2026-10-16", { cancelledFrom: "2026-10-15" })] });
    expect(b.usedHalfDays).toBe(6);
    expect(b.availableHalfDays).toBe(18);
  });

  it("charges only this year's days of a leave crossing 31 December", () => {
    const b = leaveBalance({ ...base, year: 2027, today: "2027-01-05", requests: [span("2026-12-30", "2027-01-02")] });
    expect(b.usedHalfDays).toBe(4);
    expect(b.availableHalfDays).toBe(20);
  });

  it("lets unused leave lapse at the year end: a new year starts full (D41)", () => {
    const b = leaveBalance({ ...base, year: 2027, today: "2027-01-05", requests: [span("2026-03-02", "2026-03-03")] });
    expect(b.availableHalfDays).toBe(24);
  });

  it("adds HR adjustments made in the year", () => {
    const b = leaveBalance({ ...base, grants: [{ halfDays: -2, grantedOn: "2026-04-01", expiresOn: null }], requests: [] });
    expect(b.availableHalfDays).toBe(22);
  });

  it("has no balance for unpaid leave, only usage", () => {
    const b = leaveBalance({ ...base, type: { usesBalance: false, grantedOnly: false }, quotaHalfDays: 0, requests: [span("2026-03-02", "2026-03-02")] });
    expect(b.availableHalfDays).toBeNull();
    expect(b.usedHalfDays).toBe(2);
  });
});

describe("comp-off (granted only, expires after 60 days)", () => {
  const base = {
    year: 2026,
    type: { usesBalance: true, grantedOnly: true },
    quotaHalfDays: 0,
    joinDate: "2025-01-01",
    calendar,
  };
  const grant = (grantedOn: string, expiresOn: string, halfDays = 2) => ({ halfDays, grantedOn, expiresOn });

  it("is available only from grants", () => {
    const b = leaveBalance({ ...base, today: "2026-10-14", grants: [grant("2026-09-28", "2026-11-27")], requests: [] });
    expect(b.availableHalfDays).toBe(2);
    expect(b.expiring).toEqual({ halfDays: 2, on: "2026-11-27" });
  });

  it("uses the earliest-expiring valid grant first", () => {
    const b = leaveBalance({
      ...base,
      today: "2026-10-14",
      grants: [grant("2026-09-01", "2026-10-31"), grant("2026-09-28", "2026-11-27")],
      requests: [span("2026-10-15", "2026-10-15")],
    });
    expect(b.availableHalfDays).toBe(2);
    expect(b.expiring).toEqual({ halfDays: 2, on: "2026-11-27" });
  });

  it("lets an unused grant expire", () => {
    const b = leaveBalance({ ...base, today: "2026-11-01", grants: [grant("2026-09-01", "2026-10-31")], requests: [] });
    expect(b.availableHalfDays).toBe(0);
  });

  it("does not let an already-used grant's expiry reduce the balance", () => {
    const b = leaveBalance({
      ...base,
      today: "2026-11-05",
      grants: [grant("2026-09-01", "2026-10-31"), grant("2026-10-10", "2026-12-09")],
      requests: [span("2026-10-15", "2026-10-15")],
    });
    // The October leave used the first grant, which then expired empty. The second grant is intact.
    expect(b.availableHalfDays).toBe(2);
  });

  it("cannot pay a leave from a grant made after it", () => {
    const b = leaveBalance({
      ...base,
      today: "2026-10-14",
      grants: [grant("2026-10-12", "2026-12-11")],
      requests: [span("2026-10-05", "2026-10-05")],
    });
    expect(b.availableHalfDays).toBe(2);
  });
});

describe("overlaps", () => {
  it("detects shared days and ignores cut-short tails", () => {
    expect(overlaps(span("2026-10-12", "2026-10-14"), span("2026-10-14", "2026-10-16"))).toBe(true);
    expect(overlaps(span("2026-10-12", "2026-10-13"), span("2026-10-14", "2026-10-16"))).toBe(false);
    expect(overlaps(span("2026-10-12", "2026-10-16", { cancelledFrom: "2026-10-14" }), span("2026-10-14", "2026-10-14"))).toBe(false);
  });
});

describe("approver (D42)", () => {
  const active = new Set(["mgr", "owner", "p1"]);

  it("is the person's manager", () => {
    expect(approverFor({ requester: { id: "p1", roles: ["designer"], reportsToId: "mgr" }, activePeopleIds: active, ownerIds: ["owner"] })).toEqual({
      approverId: "mgr",
      autoApprove: false,
    });
  });

  it("falls back to the owner when there is no active manager", () => {
    expect(approverFor({ requester: { id: "p1", roles: ["designer"], reportsToId: "gone" }, activePeopleIds: active, ownerIds: ["owner"] }).approverId).toBe("owner");
    expect(approverFor({ requester: { id: "p1", roles: ["hr"], reportsToId: null }, activePeopleIds: active, ownerIds: ["owner"] }).approverId).toBe("owner");
  });

  it("auto-approves the owner's own leave", () => {
    expect(approverFor({ requester: { id: "owner", roles: ["owner"], reportsToId: null }, activePeopleIds: active, ownerIds: ["owner"] }).autoApprove).toBe(true);
  });
});

describe("cancelling (D43)", () => {
  const today = "2026-10-14";

  it("cancels pending leave at once", () => {
    expect(cancelOutcome(span("2026-10-12", "2026-10-13", { status: "pending" }), today)).toEqual({ kind: "cancel" });
  });

  it("cancels approved leave that hasn't started", () => {
    expect(cancelOutcome(span("2026-10-15", "2026-10-16"), today)).toEqual({ kind: "cancel" });
  });

  it("asks the approver to cut short leave that has started", () => {
    expect(cancelOutcome(span("2026-10-13", "2026-10-17"), today)).toEqual({ kind: "request_cut_short", from: "2026-10-15" });
  });

  it("refuses leave that is already over, or ends today", () => {
    expect(cancelOutcome(span("2026-10-01", "2026-10-02"), today).kind).toBe("not_allowed");
    expect(cancelOutcome(span("2026-10-13", "2026-10-14"), today).kind).toBe("not_allowed");
    expect(cancelOutcome(span("2026-10-20", "2026-10-21", { status: "rejected" }), today).kind).toBe("not_allowed");
  });
});

describe("labels", () => {
  it("shows half-days as days", () => {
    expect(daysLabel(2)).toBe("1 day");
    expect(daysLabel(5)).toBe("2.5 days");
  });
});
