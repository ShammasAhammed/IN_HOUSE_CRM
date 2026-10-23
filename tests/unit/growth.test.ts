import { describe, expect, it } from "vitest";
import { coverageRisks, deliveryPart, growthPart, overallScore, skillPart, trendOf, weightsFor } from "@/services/rules/growth";

describe("growth scoring", () => {
  it("scores skills against the role, capped at the requirement", () => {
    expect(skillPart([{ required: 4, current: 2 }, { required: 3, current: 5 }])).toBe(75);
    expect(skillPart([])).toBeNull();
  });
  it("counts reopened work against delivery", () => {
    expect(deliveryPart({ done: 10, withDue: 10, onTime: 10, reopened: 0 })).toBe(100);
    expect(deliveryPart({ done: 10, withDue: 10, onTime: 10, reopened: 5 })).toBe(85);
    expect(deliveryPart({ done: 0, withDue: 0, onTime: 0, reopened: 0 })).toBeNull();
  });
  it("reads growth from goals closed, learning shown and nothing overdue", () => {
    expect(growthPart({ goalsClosed: 2, goalsActive: 2, goalsOverdue: 0, learningAssigned: 2, learningShown: 2 })).toBe(100);
    expect(growthPart({ goalsClosed: 0, goalsActive: 2, goalsOverdue: 1, learningAssigned: 0, learningShown: 0 })).toBe(15);
    expect(growthPart({ goalsClosed: 0, goalsActive: 0, goalsOverdue: 0, learningAssigned: 0, learningShown: 0 })).toBeNull();
  });
  it("re-weights over the parts measured, with weights by position", () => {
    expect(overallScore({ delivery: 80, skill: 60, growth: null, people: null }, weightsFor(["designer"]))).toBe(Math.round((80 * 40 + 60 * 25) / 65));
    expect(overallScore({ delivery: null, skill: null, growth: null, people: null }, weightsFor([]))).toBeNull();
    expect(weightsFor(["bdo"])).toEqual({ delivery: 35, skill: 25, growth: 20, people: 20 });
  });
  it("shows direction and the skills resting on one person", () => {
    expect(trendOf([60, 62, 66])).toBe("rising");
    expect(trendOf([75, 70])).toBe("falling");
    expect(trendOf([70])).toBeNull();
    expect(coverageRisks([{ id: "a", name: "Meta ads" }, { id: "b", name: "Editing" }], [{ skillId: "a", personId: "p1", level: 4 }, { skillId: "b", personId: "p1", level: 3 }, { skillId: "b", personId: "p2", level: 3 }])).toEqual([{ id: "a", name: "Meta ads", people: 1 }]);
  });
});
