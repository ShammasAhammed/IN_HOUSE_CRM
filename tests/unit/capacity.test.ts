import { describe, expect, it } from "vitest";
import { dailyCapacity, taskLoad, weekLoad, type CapacityCalendar } from "@/services/rules/capacity";
import { DEFAULT_WORK_WEEK } from "@/services/rules/working-days";

const calendar: CapacityCalendar = { week: DEFAULT_WORK_WEEK, holidays: new Set(["2026-10-20"]) };
const today = "2026-10-14"; // Wednesday
const none = new Map<string, 0.5 | 1>();

describe("daily capacity", () => {
  it("shares weekly hours over the standard working days", () => {
    // Week of 12 Oct: Mon–Sat all working (the 17th is the third Saturday). 40h / 6 days = 400 min.
    const cap = dailyCapacity({ weeklyMinutes: 2400, weekStart: "2026-10-12", calendar, leave: none });
    expect(cap.get("2026-10-12")).toBe(400);
    expect(cap.get("2026-10-18")).toBe(0); // Sunday
    expect([...cap.values()].reduce((a, b) => a + b, 0)).toBe(2400);
  });

  it("has no capacity before someone joined or after they left (test report L2)", () => {
    const cap = dailyCapacity({ weeklyMinutes: 2400, weekStart: "2026-10-12", calendar, leave: none, joinDate: "2026-10-15", endDate: "2026-10-16" });
    expect([...cap.entries()].filter(([, m]) => m > 0).map(([d]) => d)).toEqual(["2026-10-15", "2026-10-16"]);
  });

  it("uses the week's own working days when the second Saturday is off", () => {
    // Week of 5 Oct: Mon–Fri working, Sat 10th off → 5 days of 480 minutes.
    const cap = dailyCapacity({ weeklyMinutes: 2400, weekStart: "2026-10-05", calendar, leave: none });
    expect(cap.get("2026-10-05")).toBe(480);
    expect(cap.get("2026-10-10")).toBe(0);
  });

  it("removes holidays and leave, halves a half day", () => {
    // Week of 19 Oct: Tue 20th is a holiday; the person is off Wed and half of Thu.
    const leave = new Map<string, 0.5 | 1>([
      ["2026-10-21", 1],
      ["2026-10-22", 0.5],
    ]);
    const cap = dailyCapacity({ weeklyMinutes: 2400, weekStart: "2026-10-19", calendar, leave });
    expect(cap.get("2026-10-20")).toBe(0);
    expect(cap.get("2026-10-21")).toBe(0);
    expect(cap.get("2026-10-22")).toBe(200);
    expect([...cap.values()].reduce((a, b) => a + b, 0)).toBe(400 * 3 + 200);
  });
});

describe("task load", () => {
  it("spreads the estimate evenly from start to due over working days", () => {
    const load = taskLoad({ estimateMinutes: 300, startDate: "2026-10-15", dueDate: "2026-10-17", status: "todo" }, today, calendar);
    expect([...load.entries()]).toEqual([
      ["2026-10-15", 100],
      ["2026-10-16", 100],
      ["2026-10-17", 100],
    ]);
  });

  it("puts any rounding remainder on the due date", () => {
    const load = taskLoad({ estimateMinutes: 100, startDate: "2026-10-15", dueDate: "2026-10-17", status: "todo" }, today, calendar);
    expect(load.get("2026-10-17")).toBe(34);
    expect([...load.values()].reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("without a start date, spreads over the due date's week up to the due date", () => {
    const load = taskLoad({ estimateMinutes: 180, startDate: null, dueDate: "2026-10-14", status: "todo" }, today, calendar);
    expect([...load.keys()]).toEqual(["2026-10-12", "2026-10-13", "2026-10-14"]);
  });

  it("uses 60 minutes when there is no estimate, and skips holidays", () => {
    const load = taskLoad({ estimateMinutes: null, startDate: "2026-10-20", dueDate: "2026-10-21", status: "todo" }, today, calendar);
    expect([...load.entries()]).toEqual([["2026-10-21", 60]]);
  });

  it("puts all of an open overdue task on today", () => {
    const load = taskLoad({ estimateMinutes: 120, startDate: "2026-10-05", dueDate: "2026-10-09", status: "in_progress" }, today, calendar);
    expect([...load.entries()]).toEqual([[today, 120]]);
  });

  it("leaves a done task where it was planned", () => {
    const load = taskLoad({ estimateMinutes: 120, startDate: "2026-10-08", dueDate: "2026-10-09", status: "done" }, today, calendar);
    expect([...load.keys()]).toEqual(["2026-10-08", "2026-10-09"]);
  });

  it("frees today and later days once a task is done (QA S9-04)", () => {
    const load = taskLoad({ estimateMinutes: 180, startDate: "2026-10-13", dueDate: "2026-10-16", status: "done" }, today, calendar);
    expect([...load.keys()]).toEqual(["2026-10-13"]);
  });

  it("ignores unscheduled tasks, and lands on the due date when every day is off", () => {
    expect(taskLoad({ estimateMinutes: 60, startDate: null, dueDate: null, status: "todo" }, today, calendar).size).toBe(0);
    expect([...taskLoad({ estimateMinutes: 60, startDate: "2026-10-18", dueDate: "2026-10-18", status: "todo" }, today, calendar).keys()]).toEqual(["2026-10-18"]);
  });
});

describe("week load", () => {
  const base = { weekStart: "2026-10-12", today, weeklyMinutes: 2400, leave: none, calendar };

  it("is over when assigned beats capacity", () => {
    const w = weekLoad({ ...base, tasks: [{ estimateMinutes: 2700, startDate: "2026-10-12", dueDate: "2026-10-17", status: "todo" }] });
    expect(w).toMatchObject({ capacityMinutes: 2400, assignedMinutes: 2700, loadPercent: 113, level: "over" });
  });

  it("is light under half of capacity, ok in between", () => {
    expect(weekLoad({ ...base, tasks: [{ estimateMinutes: 600, startDate: "2026-10-12", dueDate: "2026-10-13", status: "todo" }] }).level).toBe("light");
    expect(weekLoad({ ...base, tasks: [{ estimateMinutes: 1800, startDate: "2026-10-12", dueDate: "2026-10-16", status: "todo" }] }).level).toBe("ok");
  });

  it("counts only the days inside the week", () => {
    const w = weekLoad({ ...base, tasks: [{ estimateMinutes: 1000, startDate: "2026-10-16", dueDate: "2026-10-19", status: "todo" }] });
    // Fri 16, Sat 17, Mon 19 → the Monday part falls in next week.
    expect(w.assignedMinutes).toBe(666);
  });

  it("flags work for someone with no capacity at all", () => {
    expect(weekLoad({ ...base, weeklyMinutes: 0, tasks: [{ estimateMinutes: 60, startDate: null, dueDate: "2026-10-15", status: "todo" }] })).toMatchObject({
      loadPercent: null,
      level: "over",
    });
  });
});
