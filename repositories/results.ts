// Results per client (Stage 11.1): the month's leads, spend, counselling calls, admissions and targets.
import type { IsoDate } from "@/lib/dates";
import type { ResultSource } from "@/lib/types";

export type MonthNumbers = {
  leads: number | null;
  spendPaise: number | null;
  callsBooked: number | null;
  admissions: number | null;
  targetLeads: number | null;
  targetAdmissions: number | null;
};

export type MonthResultRecord = MonthNumbers & {
  id: string;
  clientId: string;
  engagementId: string | null;
  /** The first day of the month. */
  month: IsoDate;
  leadsSource: ResultSource;
  spendSource: ResultSource;
  updatedByName: string | null;
  updatedAt: Date;
};

export type MonthResultWrite = MonthNumbers & {
  clientId: string;
  engagementId: string | null;
  month: IsoDate;
  leadsSource: ResultSource;
  spendSource: ResultSource;
  updatedById: string;
};

export interface ResultsRepository {
  /** Months between `from` and `to` (first days, inclusive), oldest first; every client when `clientIds` is left out. */
  list(opts: { clientIds?: readonly string[]; from: IsoDate; to: IsoDate }): Promise<MonthResultRecord[]>;
  /** Insert, or replace the client's numbers for that month. Returns the row's id. */
  save(id: string, row: MonthResultWrite, at: Date): Promise<string>;
  /**
   * Stage 14.5: Oppllo's own month, live from Sales (India time): new leads (and by channel), demos booked (leads
   * moved to "audit booked"), colleges won.
   */
  selfLive(month: IsoDate): Promise<SelfLive>;
}

export type SelfLive = { leads: number; demos: number; won: number; byChannel: Array<{ channel: string; leads: number }> };
