// Results per client (Stage 11.1): costs, rates and health.
import { describe, expect, it } from "vitest";
import type { MonthNumbers } from "@/repositories";
import { clientHealth, costPer, judgedMonth, ratePercent } from "@/services/rules/results";

const month = (n: Partial<MonthNumbers>): MonthNumbers => ({ leads: null, spendPaise: null, callsBooked: null, admissions: null, targetLeads: null, targetAdmissions: null, ...n });

describe("costs and rates", () => {
  it("divide in whole paise and one-decimal percentages", () => {
    expect(costPer(1_500_000, 60)).toBe(25_000);
    expect(costPer(1_000_000, 3)).toBe(333_333);
    expect(ratePercent(7, 120)).toBe(5.8);
    expect(ratePercent(1, 3)).toBe(33.3);
  });

  it("are null, never NaN or Infinity, when a number is missing or zero", () => {
    expect(costPer(1_000_000, 0)).toBeNull();
    expect(costPer(null, 10)).toBeNull();
    expect(costPer(1_000_000, null)).toBeNull();
    expect(costPer(0, 10)).toBe(0);
    expect(ratePercent(5, 0)).toBeNull();
    expect(ratePercent(null, 100)).toBeNull();
    expect(ratePercent(0, 100)).toBe(0);
  });
});

describe("the judged month", () => {
  it("is last month, whole, in the first week; then this month at its pace", () => {
    expect(judgedMonth("2026-10-07")).toEqual({ month: "2026-09-01", elapsed: 1 });
    expect(judgedMonth("2026-01-03")).toEqual({ month: "2025-12-01", elapsed: 1 });
    expect(judgedMonth("2026-10-08").month).toBe("2026-10-01");
    expect(judgedMonth("2026-11-15").elapsed).toBe(0.5);
  });
});

describe("client health", () => {
  const today = "2026-11-15"; // half the month gone

  it("has nothing to judge without targets or an hours problem", () => {
    expect(clientHealth({ today, results: null, burnPercent: null }).level).toBe("no_target");
    expect(clientHealth({ today, results: month({ leads: 40 }), burnPercent: 60 }).level).toBe("no_target");
  });

  it("judges results against the target at the month's pace", () => {
    // 100 leads target → 50 expected by mid-month.
    expect(clientHealth({ today, results: month({ leads: 45, targetLeads: 100 }), burnPercent: null }).level).toBe("on_track");
    const risk = clientHealth({ today, results: month({ leads: 30, targetLeads: 100 }), burnPercent: null });
    expect(risk).toEqual({ level: "at_risk", month: "2026-11-01", reasons: ["Leads 30 of 100 (50 expected by now)"] });
    expect(clientHealth({ today, results: month({ leads: 20, targetLeads: 100 }), burnPercent: null }).level).toBe("off_track");
  });

  it("takes the worse of leads and admissions", () => {
    const h = clientHealth({ today, results: month({ leads: 80, targetLeads: 100, admissions: 1, targetAdmissions: 10 }), burnPercent: null });
    expect(h.level).toBe("off_track");
    expect(h.reasons).toEqual(["Admissions 1 of 10 (5 expected by now)"]);
  });

  it("calls a target with no number entered at risk, not off track", () => {
    const h = clientHealth({ today, results: month({ targetLeads: 100 }), burnPercent: null });
    expect(h).toMatchObject({ level: "at_risk", reasons: ["Leads not entered yet (target 100)"] });
  });

  it("flags retainer hours at or over budget as at risk, never worse", () => {
    expect(clientHealth({ today, results: null, burnPercent: 100 })).toMatchObject({ level: "at_risk", reasons: ["Retainer hours at 100% of budget"] });
    expect(clientHealth({ today, results: month({ leads: 60, targetLeads: 100 }), burnPercent: 140 }).level).toBe("at_risk");
    expect(clientHealth({ today, results: month({ leads: 10, targetLeads: 100 }), burnPercent: 140 }).level).toBe("off_track");
    expect(clientHealth({ today, results: month({ leads: 60, targetLeads: 100 }), burnPercent: 99 }).level).toBe("on_track");
  });

  it("judges last month whole in the first week", () => {
    const h = clientHealth({ today: "2026-11-03", results: month({ leads: 70, targetLeads: 100 }), burnPercent: null });
    expect(h).toEqual({ level: "at_risk", month: "2026-10-01", reasons: ["Leads 70 of 100"] });
  });
});
