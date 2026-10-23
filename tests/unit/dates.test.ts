import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  dayOfWeek,
  daysInMonth,
  diffDays,
  eachDay,
  endOfMonth,
  isIsoDate,
  istDate,
  startOfWeek,
} from "@/lib/dates";

describe("dates", () => {
  it("validates ISO dates strictly", () => {
    expect(isIsoDate("2026-10-14")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("14-10-2026")).toBe(false);
    expect(isIsoDate(20261014)).toBe(false);
  });

  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("adds months clamping to the last day", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-11-15", 2)).toBe("2027-01-15");
  });

  it("counts days and lists ranges inclusively", () => {
    expect(diffDays("2026-10-01", "2026-10-31")).toBe(30);
    expect(eachDay("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(eachDay("2026-11-02", "2026-11-01")).toEqual([]);
  });

  it("knows month lengths, weekdays and week starts", () => {
    expect(daysInMonth("2026-02-10")).toBe(28);
    expect(endOfMonth("2026-04-03")).toBe("2026-04-30");
    expect(dayOfWeek("2026-10-14")).toBe(3); // Wednesday
    expect(startOfWeek("2026-10-14")).toBe("2026-10-12");
    expect(startOfWeek("2026-10-18")).toBe("2026-10-12"); // Sunday belongs to the week before
  });

  it("uses India time for today's date", () => {
    // 20:00 UTC on 14 Oct is 01:30 on 15 Oct in India.
    expect(istDate(new Date("2026-10-14T20:00:00Z"))).toBe("2026-10-15");
    expect(istDate(new Date("2026-10-14T18:00:00Z"))).toBe("2026-10-14");
  });
});
