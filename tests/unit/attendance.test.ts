import { describe, expect, it } from "vitest";
import { istInstant, istMinutesOfDay, istTime } from "@/lib/dates";
import { attendanceMonth, isLate, isShort } from "@/services/rules/attendance";
import type { DayLeave } from "@/services/rules/leave";
import { DEFAULT_WORK_WEEK } from "@/services/rules/working-days";

const at = (date: string, time: string) => istInstant(date, time);

describe("India times", () => {
  it("converts both ways", () => {
    expect(at("2026-10-14", "09:30").toISOString()).toBe("2026-10-14T04:00:00.000Z");
    expect(istMinutesOfDay(new Date("2026-10-13T20:00:00Z"))).toBe(90); // 1:30 am on the 14th
    expect(istTime(at("2026-10-14", "18:05"))).toBe("18:05");
  });
});

describe("late and short (D76)", () => {
  const workday = { working: true, leave: null };
  it("is late after 9:45, for full-time staff and interns only, on working days without a morning of leave", () => {
    expect(isLate(at("2026-10-14", "09:45"), "full_time", workday)).toBe(false);
    expect(isLate(at("2026-10-14", "09:46"), "intern", workday)).toBe(true);
    expect(isLate(at("2026-10-14", "11:00"), "part_time", workday)).toBe(false);
    expect(isLate(at("2026-10-18", "11:00"), "full_time", { working: false, leave: null })).toBe(false);
    expect(isLate(at("2026-10-14", "13:30"), "full_time", { working: true, leave: { amount: 0.5, half: "first_half" } })).toBe(false);
    expect(isLate(at("2026-10-14", "10:30"), "full_time", { working: true, leave: { amount: 0.5, half: "second_half" } })).toBe(true);
  });

  it("is short under 7 hours on working days; half a day of leave halves that; open days aren't judged", () => {
    const base = { checkInAt: at("2026-10-14", "09:30"), employmentType: "full_time" as const, day: workday };
    expect(isShort({ ...base, checkOutAt: at("2026-10-14", "16:29") })).toBe(true);
    expect(isShort({ ...base, checkOutAt: at("2026-10-14", "16:30") })).toBe(false);
    expect(isShort({ ...base, checkOutAt: at("2026-10-14", "13:00"), day: { working: true, leave: { amount: 0.5, half: "second_half" } } })).toBe(false);
    expect(isShort({ ...base, checkOutAt: at("2026-10-14", "12:00"), day: { working: false, leave: null } })).toBe(false);
    expect(isShort({ ...base, checkOutAt: null })).toBe(false);
  });
});

describe("the month", () => {
  it("marks each day and counts them", () => {
    // 12–18 Oct 2026, today Friday 16th. Tue 13th holiday; Wed 14th half-day leave + worked; Thu 15th absent.
    const r = attendanceMonth({
      from: "2026-10-12",
      to: "2026-10-18",
      today: "2026-10-16",
      week: DEFAULT_WORK_WEEK,
      holidays: new Set(["2026-10-13"]),
      leave: new Map([["2026-10-14", { amount: 0.5 as const, half: "first_half" as const }]]),
      records: new Map([
        ["2026-10-12", { location: "office" as const, checkInAt: at("2026-10-12", "10:00"), checkOutAt: at("2026-10-12", "18:30") }],
        ["2026-10-14", { location: "client_site" as const, checkInAt: at("2026-10-14", "13:30"), checkOutAt: null }],
      ]),
      employmentType: "full_time",
      joinDate: "2026-01-01",
      endDate: null,
    });
    expect(r.days.map((d) => [d.date, d.kind, d.late, d.open])).toEqual([
      ["2026-10-12", "present", true, false],
      ["2026-10-13", "holiday", false, false],
      ["2026-10-14", "present", false, true],
      ["2026-10-15", "absent", false, false],
      ["2026-10-16", "today", false, false],
      ["2026-10-17", "upcoming", false, false],
      ["2026-10-18", "off", false, false],
    ]);
    expect(r.counts).toEqual({ workingDays: 4, present: { office: 1, home: 0, client_site: 1 }, leaveDays: 0.5, absent: 1, late: 1, short: 0, open: 1 });
  });

  it("doesn't count a part-timer's days off as absences, or flag a Sunday visit", () => {
    const input = {
      from: "2026-10-15",
      to: "2026-10-18",
      today: "2026-10-19",
      week: DEFAULT_WORK_WEEK,
      holidays: new Set<string>(),
      leave: new Map<string, DayLeave>(),
      records: new Map([["2026-10-18", { location: "client_site" as const, checkInAt: at("2026-10-18", "11:00"), checkOutAt: at("2026-10-18", "13:00") }]]),
      employmentType: "part_time" as const,
      joinDate: "2026-01-01",
      endDate: null,
    };
    const r = attendanceMonth(input);
    // Thu, Fri, Sat (third Saturday: working) without a record; a Sunday shoot.
    expect(r.days.map((d) => d.kind)).toEqual(["not_in", "not_in", "not_in", "present"]);
    expect(r.counts.absent).toBe(0);
    const fullTimer = attendanceMonth({ ...input, employmentType: "full_time" });
    expect(fullTimer.days.at(-1)).toMatchObject({ kind: "present", late: false, short: false });
  });

  it("ignores days before joining", () => {
    const r = attendanceMonth({ from: "2026-10-12", to: "2026-10-13", today: "2026-10-20", week: DEFAULT_WORK_WEEK, holidays: new Set(), leave: new Map(), records: new Map(), employmentType: "intern", joinDate: "2026-10-13", endDate: null });
    expect(r.days.map((d) => d.kind)).toEqual(["not_employed", "absent"]);
  });
});
