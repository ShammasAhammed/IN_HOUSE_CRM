// Skills and growth scoring (plan/5 "Continuous scoring"). Pure, unit-tested. Every part is shown to the person with
// how it was worked out: no hidden scoring, no automatic consequences, compared with the role, never with colleagues.
import type { Role } from "@/lib/types";

export type PartKey = "delivery" | "skill" | "growth" | "people";
export type Weights = Record<PartKey, number>;

/** plan/5: delivery 35, skill 25, growth 20, people 20; changed per position. */
export const DEFAULT_WEIGHTS: Weights = { delivery: 35, skill: 25, growth: 20, people: 20 };
const ROLE_WEIGHTS: Partial<Record<Role, Weights>> = {
  // Editors and designers: delivery counts most. Strategists: the people side counts more.
  video_editor: { delivery: 45, skill: 20, growth: 15, people: 20 },
  designer: { delivery: 40, skill: 25, growth: 15, people: 20 },
  strategist: { delivery: 30, skill: 25, growth: 20, people: 25 },
};
export const weightsFor = (roles: readonly Role[]): Weights => roles.map((r) => ROLE_WEIGHTS[r]).find(Boolean) ?? DEFAULT_WEIGHTS;

/** Skill part: how close each required skill is to its required level (above it counts as met, not more). */
export function skillPart(required: ReadonlyArray<{ required: number; current: number }>): number | null {
  if (!required.length) return null;
  const avg = required.reduce((n, s) => n + Math.min(s.current / s.required, 1), 0) / required.length;
  return Math.round(avg * 100);
}

/**
 * Delivery part: on-time finishing (70%) and work that stayed done (30%: reopened tasks count against it, so marking
 * things done early and badly lowers the score instead of raising it).
 */
export function deliveryPart(d: { done: number; withDue: number; onTime: number; reopened: number }): number | null {
  if (!d.done) return null;
  const onTime = d.withDue ? d.onTime / d.withDue : 1;
  const stayed = 1 - Math.min(d.reopened / d.done, 1);
  return Math.round((onTime * 0.7 + stayed * 0.3) * 100);
}

/** Growth part: goals closed, learning shown in work, nothing left overdue. Null when there is no plan yet. */
export function growthPart(g: { goalsClosed: number; goalsActive: number; goalsOverdue: number; learningAssigned: number; learningShown: number }): number | null {
  if (!g.goalsClosed && !g.goalsActive && !g.learningAssigned) return null;
  const closed = Math.min(g.goalsClosed, 2) / 2;
  const shown = g.learningAssigned ? g.learningShown / g.learningAssigned : 0;
  const onTrack = g.goalsActive ? 1 - g.goalsOverdue / g.goalsActive : 1;
  return Math.round((closed * 0.4 + shown * 0.3 + onTrack * 0.3) * 100);
}

/** The score from the parts there are: a part not measured yet (no 360 yet) is left out and the rest re-weighted. */
export function overallScore(parts: Record<PartKey, number | null>, weights: Weights): number | null {
  const present = (Object.keys(parts) as PartKey[]).filter((k) => parts[k] !== null);
  const total = present.reduce((n, k) => n + weights[k], 0);
  if (!total) return null;
  return Math.round(present.reduce((n, k) => n + parts[k]! * weights[k], 0) / total);
}

/** Direction over the last months: "rising" / "falling" when it moved 5 points or more. */
export function trendOf(history: readonly number[]): "rising" | "falling" | "steady" | null {
  if (history.length < 2) return null;
  const diff = history.at(-1)! - history[0]!;
  return diff >= 5 ? "rising" : diff <= -5 ? "falling" : "steady";
}

/** Skills only one person (or nobody) can do at level 3 or above: the agency's hidden single points of failure. */
export function coverageRisks(skills: ReadonlyArray<{ id: string; name: string }>, levels: ReadonlyArray<{ skillId: string; personId: string; level: number }>): Array<{ id: string; name: string; people: number }> {
  return skills
    .map((s) => ({ ...s, people: new Set(levels.filter((l) => l.skillId === s.id && l.level >= 3).map((l) => l.personId)).size }))
    .filter((s) => s.people <= 1)
    .sort((a, b) => a.people - b.people || a.name.localeCompare(b.name));
}
