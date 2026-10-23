// Company and team goals (Stage 14.3).
import type { IsoDate } from "@/lib/dates";
import type { GoalPeriod, GoalSource, GoalUnit } from "@/lib/types";

export type GoalCheckin = { id: string; goalId: string; value: number | null; note: string; personId: string; personName: string; createdAt: Date };
export type GoalRecord = {
  id: string;
  parentId: string | null;
  title: string;
  description: string;
  unit: GoalUnit;
  target: number;
  period: GoalPeriod;
  startsOn: IsoDate;
  endsOn: IsoDate;
  source: GoalSource;
  ownerId: string | null;
  ownerName: string | null;
  spaceId: string | null;
  spaceName: string | null;
  leadersOnly: boolean;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastCheckin: GoalCheckin | null;
  /** The latest check-in that carried a number (manual goals' current value). */
  lastValue: number | null;
};
export type NewGoal = Omit<GoalRecord, "ownerName" | "spaceName" | "createdAt" | "updatedAt" | "lastCheckin" | "lastValue"> & { at: Date };

export interface GoalsRepository {
  create(row: NewGoal): Promise<void>;
  find(id: string): Promise<GoalRecord | null>;
  /** Every goal not archived, company goals first. */
  list(): Promise<GoalRecord[]>;
  update(id: string, patch: Partial<Pick<GoalRecord, "title" | "description" | "target" | "ownerId" | "leadersOnly" | "period" | "startsOn" | "endsOn" | "source" | "unit">> & { at: Date }): Promise<void>;
  archive(id: string, at: Date): Promise<void>;
  addCheckin(row: { id: string; goalId: string; value: number | null; note: string; personId: string; at: Date }): Promise<void>;
  checkins(goalId: string, limit?: number): Promise<GoalCheckin[]>;
  setProjects(goalId: string, projectIds: readonly string[]): Promise<void>;
  /** Linked projects with their top-level tasks done and in total. */
  projects(goalIds: readonly string[]): Promise<Array<{ goalId: string; projectId: string; name: string; clientId: string; done: number; total: number }>>;
  /** The live number for a source over a period (D-14.3a); null when nothing was entered (client results). */
  liveValue(source: Exclude<GoalSource, "manual">, from: IsoDate, to: IsoDate): Promise<number | null>;
  /** Goals this person owns whose last check-in (or creation) is before `before`. */
  staleOwned(personId: string, before: Date): Promise<number>;
}
