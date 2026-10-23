// DPDP consent records (Stage 11.7).
import type { ConsentMethod, ConsentSubject } from "@/lib/types";

export type ConsentRecord = {
  id: string;
  subjectType: ConsentSubject;
  subjectId: string;
  purpose: string;
  method: ConsentMethod;
  givenAt: Date;
  note: string | null;
  recordedByName: string | null;
  withdrawnAt: Date | null;
  withdrawnMethod: ConsentMethod | null;
  withdrawnNote: string | null;
  withdrawnByName: string | null;
};

export type ConsentCounts = Record<ConsentSubject, { active: number; withdrawn: number }>;

export interface ConsentRepository {
  /** A lead's or person's records, newest first. */
  list(subjectType: ConsentSubject, subjectId: string): Promise<ConsentRecord[]>;
  find(id: string): Promise<ConsentRecord | null>;
  add(row: { id: string; subjectType: ConsentSubject; subjectId: string; purpose: string; method: ConsentMethod; givenAt: Date; note: string | null; recordedById: string | null }): Promise<void>;
  /** Record a withdrawal on a live consent. False when it was already withdrawn. */
  withdraw(id: string, w: { method: ConsentMethod; note: string | null; byId: string }, at: Date): Promise<boolean>;
  counts(): Promise<ConsentCounts>;
}
