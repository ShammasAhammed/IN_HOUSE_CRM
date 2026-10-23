import { describe, expect, it } from "vitest";
import { barFor, monthGrid, wouldLoop } from "@/services/rules/planning";

describe("monthGrid", () => {
  it("covers whole weeks, Monday first", () => {
    const days = monthGrid("2026-10-15");
    expect(days[0]).toBe("2026-09-28");
    expect(days.at(-1)).toBe("2026-11-01");
    expect(days.length % 7).toBe(0);
  });
});

describe("barFor", () => {
  it("spans start to due inside the window", () => {
    expect(barFor("2026-10-05", "2026-10-07", "2026-10-01", 14)).toEqual({ offset: 4, length: 3, startsBefore: false, endsAfter: false });
  });
  it("uses the due date alone when there is no start, or the start is after due", () => {
    expect(barFor(null, "2026-10-03", "2026-10-01", 14)).toEqual({ offset: 2, length: 1, startsBefore: false, endsAfter: false });
    expect(barFor("2026-10-09", "2026-10-03", "2026-10-01", 14)).toMatchObject({ offset: 2, length: 1 });
  });
  it("cuts bars at the edges and drops ones outside", () => {
    expect(barFor("2026-09-20", "2026-10-02", "2026-10-01", 7)).toEqual({ offset: 0, length: 2, startsBefore: true, endsAfter: false });
    expect(barFor("2026-10-06", "2026-10-30", "2026-10-01", 7)).toEqual({ offset: 5, length: 2, startsBefore: false, endsAfter: true });
    expect(barFor("2026-09-01", "2026-09-30", "2026-10-01", 7)).toBeNull();
    expect(barFor("2026-10-01", null, "2026-10-01", 7)).toBeNull();
  });
});

describe("wouldLoop", () => {
  const waitsOn = new Map([
    ["edit", ["shoot"]],
    ["shoot", ["script"]],
  ]);
  it("refuses a loop, direct or through others, and a task waiting on itself", () => {
    expect(wouldLoop("script", "edit", waitsOn)).toBe(true);
    expect(wouldLoop("shoot", "edit", waitsOn)).toBe(true);
    expect(wouldLoop("edit", "edit", waitsOn)).toBe(true);
  });
  it("allows new chains", () => {
    expect(wouldLoop("post", "edit", waitsOn)).toBe(false);
    expect(wouldLoop("edit", "script", waitsOn)).toBe(false);
  });
});
