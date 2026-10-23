// Monthly client reports (Stage 11.4).
import type { IsoDate } from "@/lib/dates";
import type { ReportStatus } from "@/lib/types";

export type ReportRecord = {
  id: string;
  clientId: string;
  month: IsoDate;
  status: ReportStatus;
  facts: unknown;
  summary: string;
  wentWell: string;
  nextSteps: string;
  version: number;
  createdByName: string;
  updatedByName: string | null;
  finalizedByName: string | null;
  finalizedAt: Date | null;
  updatedAt: Date;
};

export type ReportText = { summary: string; wentWell: string; nextSteps: string };

export interface ReportsRepository {
  find(clientId: string, month: IsoDate): Promise<ReportRecord | null>;
  /** A client's reports, newest month first. */
  list(clientId: string): Promise<Array<{ month: IsoDate; status: ReportStatus }>>;
  /** False when the client already has a report for the month. */
  create(row: { id: string; clientId: string; month: IsoDate; facts: unknown; createdById: string }): Promise<boolean>;
  /** Change a draft still at `expectedVersion`. False when it is final or someone saved first. */
  update(id: string, expectedVersion: number, patch: Partial<ReportText> & { facts?: unknown; aiUsageId?: string; updatedById: string }, at: Date): Promise<boolean>;
  finalize(id: string, expectedVersion: number, byId: string, at: Date): Promise<boolean>;
}
