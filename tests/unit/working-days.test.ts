import { describe, expect, it } from "vitest";
import { DEFAULT_WORK_WEEK, isWorkingDay, previousWorkingDay, workingDays } from "@/services/rules/working-days";

describe("working days", () => {
  it("works Monday to Saturday", () => {
    expect(isWorkingDay("2026-10-12", DEFAULT_WORK_WEEK)).toBe(true); // Monday
    expect(isWorkingDay("2026-10-18", DEFAULT_WORK_WEEK)).toBe(false); // Sunday
    expect(isWorkingDay("2026-10-03", DEFAULT_WORK_WEEK)).toBe(true); // first Saturday
  });

  it("gives the second Saturday off", () => {
    expect(isWorkingDay("2026-10-10", DEFAULT_WORK_WEEK)).toBe(false); // second Saturday
    expect(isWorkingDay("2026-10-17", DEFAULT_WORK_WEEK)).toBe(true); // third Saturday
    expect(isWorkingDay("2026-08-08", DEFAULT_WORK_WEEK)).toBe(false);
  });

  it("skips holidays", () => {
    expect(isWorkingDay("2026-10-02", DEFAULT_WORK_WEEK, new Set(["2026-10-02"]))).toBe(false);
  });

  it("lists working days in a range", () => {
    // 5–11 Oct 2026: Mon–Fri working, Sat 10th is the second Saturday, Sun off.
    expect(workingDays("2026-10-05", "2026-10-11", DEFAULT_WORK_WEEK)).toHaveLength(5);
    expect(workingDays("2026-10-12", "2026-10-18", DEFAULT_WORK_WEEK)).toHaveLength(6);
  });

  it("finds the previous working day", () => {
    expect(previousWorkingDay("2026-10-11", DEFAULT_WORK_WEEK)).toBe("2026-10-09");
    expect(previousWorkingDay("2026-10-12", DEFAULT_WORK_WEEK)).toBe("2026-10-12");
  });
});
