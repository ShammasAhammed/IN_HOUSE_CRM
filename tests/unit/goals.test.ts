// Goals (Stage 14.3): financial-year periods, health by pace like 11.1, blank isn't zero.
import { describe, expect, it } from "vitest";
import { elapsedShare, goalHealth, periodLabel, periodOf } from "@/services/rules/goals";

const g = (over: Partial<Parameters<typeof goalHealth>[0]> = {}) => goalHealth({ target: 100, actual: 50, unit: "count", source: "manual", startsOn: "2026-04-01", endsOn: "2027-03-31", today: "2026-10-01", ...over });

describe("periods", () => {
  it("follow the financial year", () => {
    expect(periodOf("year", "2026-10-21")).toEqual({ startsOn: "2026-04-01", endsOn: "2027-03-31" });
    expect(periodOf("year", "2027-02-10")).toEqual({ startsOn: "2026-04-01", endsOn: "2027-03-31" });
    expect(periodOf("quarter", "2026-10-21")).toEqual({ startsOn: "2026-10-01", endsOn: "2026-12-31" });
    expect(periodOf("quarter", "2027-02-10")).toEqual({ startsOn: "2027-01-01", endsOn: "2027-03-31" });
    expect(periodOf("month", "2026-02-10")).toEqual({ startsOn: "2026-02-01", endsOn: "2026-02-28" });
    expect(periodLabel("year", "2026-04-01")).toBe("FY 2026–27");
    expect(periodLabel("quarter", "2026-10-01")).toBe("Q3 FY 2026–27");
    expect(periodLabel("quarter", "2027-01-01")).toBe("Q4 FY 2026–27");
    expect(elapsedShare("2026-10-01", "2026-10-31", "2026-10-31")).toBe(1);
    expect(elapsedShare("2026-10-01", "2026-10-31", "2026-09-30")).toBe(0);
  });
});

describe("health", () => {
  it("pace like 11.1: 80% at risk, 50% off track", () => {
    // 2026-10-01 is 183 of 365 days: about half the year gone, so 50 of 100 is on pace.
    expect(g().level).toBe("on_track");
    expect(g({ actual: 40 }).level).toBe("at_risk");
    expect(g({ actual: 20 }).level).toBe("off_track");
    expect(g({ actual: 20 }).reasons[0]).toMatch(/% of the pace expected by now/);
    expect(g({ actual: 120, today: "2027-04-10" }).percent).toBe(120);
  });
  it("blank isn't zero; zero is judged", () => {
    expect(g({ actual: null })).toMatchObject({ level: "at_risk", percent: null });
    expect(g({ actual: 0 }).level).toBe("off_track");
    expect(g({ target: 0 }).level).toBe("no_target");
    expect(g({ today: "2026-03-01" }).level).toBe("no_target");
  });
  it("too early to judge, and levels against the whole target", () => {
    expect(g({ actual: 1, today: "2026-04-20" })).toMatchObject({ level: "on_track", reasons: ["Too early to judge"] });
    expect(g({ actual: 60, unit: "percent", target: 90, today: "2026-04-20" }).level).toBe("at_risk");
    expect(g({ actual: 30, source: "active_clients", target: 40 }).level).toBe("at_risk");
  });
});
