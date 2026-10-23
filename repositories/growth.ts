// Skills and growth (plan/5).
import type { IsoDate } from "@/lib/dates";
import type { GoalStatus, LearningKind, LearningStatus, Role, SkillGroup } from "@/lib/types";

export type SkillRow = { id: string; name: string; group: SkillGroup; description: string | null; departmentId: string | null; departmentName: string | null; position: number };
export type RoleSkillRow = { role: Role; skillId: string; requiredLevel: number };
export type LevelRow = { personId: string; skillId: string; level: number; evidence: string | null; setByName: string | null; createdAt: Date };
export type GoalRow = {
  id: string;
  personId: string;
  skillId: string | null;
  skillName: string | null;
  title: string;
  targetLevel: number | null;
  dueDate: IsoDate | null;
  plan: string | null;
  proof: string | null;
  status: GoalStatus;
  closedAt: Date | null;
  createdAt: Date;
};
export type LearningRow = {
  id: string;
  personId: string;
  goalId: string | null;
  kind: LearningKind;
  title: string;
  url: string | null;
  docId: string | null;
  taskId: string | null;
  status: LearningStatus;
  minutes: number | null;
  costPaise: number | null;
  assignedByName: string | null;
  createdAt: Date;
};
export type ScoreRow = { personId: string; month: IsoDate; score: number; parts: Record<string, number | null> };

export interface GrowthRepository {
  /** Serialises changes to one person's goals (the three-goal cap) inside a transaction. */
  lockPerson(personId: string): Promise<void>;
  skills(): Promise<SkillRow[]>;
  findSkill(id: string): Promise<SkillRow | null>;
  addSkill(row: { id: string; name: string; group: SkillGroup; description: string | null; departmentId: string | null; position: number }): Promise<void>;
  updateSkill(id: string, patch: Partial<{ name: string; group: SkillGroup; description: string | null; departmentId: string | null; deletedAt: Date }>): Promise<void>;
  roleSkills(): Promise<RoleSkillRow[]>;
  /** Sets (or, with null, removes) what a role needs of a skill. */
  setRoleSkill(role: Role, skillId: string, level: number | null, id: string, at: Date): Promise<boolean>;
  /** Everyone's current level per skill (the latest set). */
  currentLevels(personIds?: readonly string[]): Promise<LevelRow[]>;
  levelHistory(personId: string): Promise<LevelRow[]>;
  addLevel(row: { id: string; personId: string; skillId: string; level: number; evidence: string | null; setById: string }): Promise<void>;
  goals(filter: { personId?: string; status?: GoalStatus }): Promise<GoalRow[]>;
  findGoal(id: string): Promise<GoalRow | null>;
  addGoal(row: { id: string; personId: string; skillId: string | null; title: string; targetLevel: number | null; dueDate: IsoDate | null; plan: string | null; proof: string | null; createdById: string }): Promise<void>;
  updateGoal(id: string, patch: Partial<{ status: GoalStatus; closedAt: Date | null; title: string; dueDate: IsoDate | null; plan: string | null; proof: string | null; deletedAt: Date }>): Promise<void>;
  learning(filter: { personId?: string; goalId?: string }): Promise<LearningRow[]>;
  findLearning(id: string): Promise<LearningRow | null>;
  addLearning(row: { id: string; personId: string; goalId: string | null; kind: LearningKind; title: string; url: string | null; docId: string | null; taskId: string | null; minutes: number | null; costPaise: number | null; assignedById: string }): Promise<void>;
  updateLearning(id: string, patch: Partial<{ status: LearningStatus; deletedAt: Date }>): Promise<void>;
  scores(personIds: readonly string[], fromMonth: IsoDate): Promise<ScoreRow[]>;
  saveScore(row: { id: string; personId: string; month: IsoDate; score: number; parts: Record<string, number | null> }): Promise<void>;
  /** Tasks owned by the person that were reopened after being done, since a time (rework). */
  reopenedCount(personId: string, since: Date): Promise<number>;
}
