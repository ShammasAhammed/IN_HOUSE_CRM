import { describe, expect, it } from "vitest";
import { burn, periodTerms, rolloverMinutes } from "@/services/rules/retainer";

const H = 60;

describe("periodTerms", () => {
  const base = { engagementEnd: null, monthlyBudgetMinutes: 40 * H, monthlyFeePaise: 60_000_00 };

  it("gives the full month when the engagement covers it", () => {
    expect(periodTerms({ ...base, engagementStart: "2026-01-10", anyDateInMonth: "2026-10-14" })).toEqual({
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
      coveredDays: 31,
      baseBudgetMinutes: 40 * H,
      feePaise: 60_000_00,
    });
  });

  it("prorates a mid-month start by calendar days remaining, inclusive", () => {
    // Starts 16 Sep: 15 of 30 days → half.
    const t = periodTerms({ ...base, engagementStart: "2026-09-16", anyDateInMonth: "2026-09-01" });
    expect(t?.coveredDays).toBe(15);
    expect(t?.baseBudgetMinutes).toBe(20 * H);
    expect(t?.feePaise).toBe(30_000_00);
  });

  it("rounds a prorated budget to the quarter hour and the fee to the paisa", () => {
    // Starts 18 Aug: 14 of 31 days. 2400 × 14/31 = 1083.87 → 1080 minutes.
    const t = periodTerms({ ...base, engagementStart: "2026-08-18", anyDateInMonth: "2026-08-31" });
    expect(t?.baseBudgetMinutes).toBe(1080);
    expect(t?.feePaise).toBe(Math.round((60_000_00 * 14) / 31));
    expect(Number.isInteger(t?.feePaise)).toBe(true);
  });

  it("prorates the last month when the engagement ends mid-month", () => {
    const t = periodTerms({ ...base, engagementStart: "2026-01-01", engagementEnd: "2026-02-14", anyDateInMonth: "2026-02-01" });
    expect(t?.coveredDays).toBe(14);
    expect(t?.baseBudgetMinutes).toBe(20 * H);
  });

  it("returns null for months the engagement does not touch", () => {
    expect(periodTerms({ ...base, engagementStart: "2026-11-01", anyDateInMonth: "2026-10-14" })).toBeNull();
    expect(periodTerms({ ...base, engagementStart: "2026-01-01", engagementEnd: "2026-09-30", anyDateInMonth: "2026-10-01" })).toBeNull();
  });

  it("handles a start on the last day of the month", () => {
    const t = periodTerms({ ...base, engagementStart: "2026-10-31", anyDateInMonth: "2026-10-01" });
    expect(t?.coveredDays).toBe(1);
    expect(t?.baseBudgetMinutes).toBe(75); // 2400/31 = 77.4 → 75
  });
});

describe("rolloverMinutes", () => {
  const monthly = 40 * H;

  it("is zero when unused hours expire (the default)", () => {
    expect(
      rolloverMinutes({ policy: "expire", monthlyBudgetMinutes: monthly, previous: { baseBudgetMinutes: monthly, rolloverInMinutes: 0, usedMinutes: 10 * H } }),
    ).toBe(0);
  });

  it("rolls the unused part of the month's own budget", () => {
    expect(
      rolloverMinutes({ policy: "rollover", monthlyBudgetMinutes: monthly, previous: { baseBudgetMinutes: monthly, rolloverInMinutes: 0, usedMinutes: 30 * H } }),
    ).toBe(10 * H);
  });

  it("uses rolled-in hours first, and they never roll again", () => {
    // 10h rolled in, 25h used → 10h from rollover, 15h from base → 25h of base unused rolls.
    expect(
      rolloverMinutes({ policy: "rollover", monthlyBudgetMinutes: monthly, previous: { baseBudgetMinutes: monthly, rolloverInMinutes: 10 * H, usedMinutes: 25 * H } }),
    ).toBe(25 * H);
    // Nothing used: only the base 40h can roll, not the 10h rolled in.
    expect(
      rolloverMinutes({ policy: "rollover", monthlyBudgetMinutes: monthly, previous: { baseBudgetMinutes: monthly, rolloverInMinutes: 10 * H, usedMinutes: 0 } }),
    ).toBe(40 * H);
  });

  it("never carries overage forward as a negative", () => {
    expect(
      rolloverMinutes({ policy: "rollover", monthlyBudgetMinutes: monthly, previous: { baseBudgetMinutes: monthly, rolloverInMinutes: 0, usedMinutes: 55 * H } }),
    ).toBe(0);
  });

  it("is capped at one full month's budget", () => {
    expect(
      rolloverMinutes({ policy: "rollover", monthlyBudgetMinutes: 20 * H, previous: { baseBudgetMinutes: 30 * H, rolloverInMinutes: 0, usedMinutes: 0 } }),
    ).toBe(20 * H);
  });
});

describe("burn", () => {
  const period = { periodStart: "2026-10-01", periodEnd: "2026-10-31" };

  it("is ok under 80%", () => {
    const b = burn({ ...period, baseBudgetMinutes: 40 * H, rolloverInMinutes: 0, usedMinutes: 20 * H, today: "2026-10-14" });
    expect(b).toMatchObject({ budgetMinutes: 2400, remainingMinutes: 1200, usedPercent: 50, level: "ok", crossed: [], daysLeft: 17 });
    expect(b.elapsedPercent).toBe(45);
  });

  it("warns at exactly 80% and counts rolled-in hours in the budget", () => {
    const b = burn({ ...period, baseBudgetMinutes: 30 * H, rolloverInMinutes: 10 * H, usedMinutes: 32 * H, today: "2026-10-20" });
    expect(b.usedPercent).toBe(80);
    expect(b.level).toBe("warning");
    expect(b.crossed).toEqual([80]);
  });

  it("is over at 100% and keeps counting past it", () => {
    const b = burn({ ...period, baseBudgetMinutes: 40 * H, rolloverInMinutes: 0, usedMinutes: 46 * H, today: "2026-10-31" });
    expect(b).toMatchObject({ usedPercent: 115, level: "over", crossed: [80, 100], remainingMinutes: -360, daysLeft: 0, elapsedPercent: 100 });
  });

  it("does not report 100% until it is really reached (floors the percent)", () => {
    const b = burn({ ...period, baseBudgetMinutes: 1000, rolloverInMinutes: 0, usedMinutes: 999, today: "2026-10-14" });
    expect(b.usedPercent).toBe(99);
    expect(b.level).toBe("warning");
  });

  it("treats any use of a zero budget as over", () => {
    expect(burn({ ...period, baseBudgetMinutes: 0, rolloverInMinutes: 0, usedMinutes: 30, today: "2026-10-01" }).level).toBe("over");
    expect(burn({ ...period, baseBudgetMinutes: 0, rolloverInMinutes: 0, usedMinutes: 0, today: "2026-10-01" }).level).toBe("ok");
  });

  it("clamps elapsed time before and after the period", () => {
    expect(burn({ ...period, baseBudgetMinutes: 60, rolloverInMinutes: 0, usedMinutes: 0, today: "2026-09-20" }).elapsedPercent).toBe(0);
    expect(burn({ ...period, baseBudgetMinutes: 60, rolloverInMinutes: 0, usedMinutes: 0, today: "2026-11-05" }).daysLeft).toBe(0);
  });
});
