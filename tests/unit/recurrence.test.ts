import { describe, expect, it } from "vitest";
import { describeSchedule, dueDates, startDateFor } from "@/services/rules/recurrence";
import { DEFAULT_WORK_WEEK } from "@/services/rules/working-days";

const week = DEFAULT_WORK_WEEK;
// October 2026: the 1st is a Thursday; the second Saturday is the 10th; Vijayadashami on the 20th (a Tuesday).
const holidays = new Set(["2026-10-20"]);

describe("due dates", () => {
  it("weekly: every chosen weekday in the window", () => {
    expect(dueDates({ frequency: "weekly", weekday: 1, dayOfMonth: null, startsOn: "2026-01-01", endsOn: null }, "2026-10-14", "2026-10-28", week)).toEqual([
      "2026-10-19",
      "2026-10-26",
    ]);
  });

  it("moves a day off to the working day before: a holiday, the second Saturday", () => {
    const tuesday = dueDates({ frequency: "weekly", weekday: 2, dayOfMonth: null, startsOn: "2026-01-01", endsOn: null }, "2026-10-14", "2026-10-28", week, holidays);
    expect(tuesday).toEqual(["2026-10-19", "2026-10-27"]);
    const saturday = dueDates({ frequency: "weekly", weekday: 6, dayOfMonth: null, startsOn: "2026-01-01", endsOn: null }, "2026-10-01", "2026-10-17", week);
    expect(saturday).toEqual(["2026-10-03", "2026-10-09", "2026-10-17"]);
  });

  it("monthly on a day, and on the last working day", () => {
    const fifth = dueDates({ frequency: "monthly", weekday: null, dayOfMonth: 5, startsOn: "2026-01-01", endsOn: null }, "2026-10-14", "2026-12-31", week);
    expect(fifth).toEqual(["2026-11-05", "2026-12-05"]);
    // 31 Oct 2026 is a Saturday (a working one); 30 Nov is a Monday; 31 Jan 2027 is a Sunday.
    const last = dueDates({ frequency: "monthly", weekday: null, dayOfMonth: 31, startsOn: "2026-01-01", endsOn: null }, "2026-10-14", "2027-01-31", week);
    expect(last).toEqual(["2026-10-31", "2026-11-30", "2026-12-31", "2027-01-30"]);
  });

  it("respects the rule's own start and end", () => {
    const s = { frequency: "weekly" as const, weekday: 3, dayOfMonth: null, startsOn: "2026-10-20", endsOn: "2026-11-04" };
    expect(dueDates(s, "2026-10-01", "2026-12-31", week)).toEqual(["2026-10-21", "2026-10-28", "2026-11-04"]);
    expect(dueDates(s, "2026-11-05", "2026-12-31", week)).toEqual([]);
  });
});

describe("start dates", () => {
  it("counts working days back, skipping days off", () => {
    expect(startDateFor("2026-10-21", 0, week, holidays)).toBe("2026-10-21");
    // Wednesday 21st, three working days back over the Tuesday holiday: Mon 19, Sat 17, Fri 16.
    expect(startDateFor("2026-10-21", 3, week, holidays)).toBe("2026-10-16");
  });
});

describe("describing a schedule", () => {
  it("reads like a person would say it", () => {
    expect(describeSchedule({ frequency: "weekly", weekday: 1, dayOfMonth: null })).toBe("Every Monday");
    expect(describeSchedule({ frequency: "monthly", weekday: null, dayOfMonth: 2 })).toBe("Monthly on the 2nd");
    expect(describeSchedule({ frequency: "monthly", weekday: null, dayOfMonth: 31 })).toBe("Monthly on the last working day");
  });
});
