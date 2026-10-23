// HR slice 3: intern records, one-to-ones, letters (plan/4).
import type { HireAgain, LetterKind } from "@/lib/types";
import type { IsoDate } from "@/lib/dates";

export type InternRecordRow = {
  id: string;
  personId: string;
  batch: string;
  mentorId: string | null;
  mentorName: string | null;
  plannedEndDate: IsoDate | null;
  focus: string | null;
  strengths: string | null;
  workedOn: string | null;
  hireAgain: HireAgain | null;
  reviewNotes: string | null;
  reviewedByName: string | null;
  reviewedAt: Date | null;
  inTalentPool: boolean;
};
export type InternRecordWrite = Partial<Omit<InternRecordRow, "id" | "personId" | "mentorName" | "reviewedByName">> & { reviewedById?: string | null };

export type OneToOneRow = { id: string; personId: string; leadId: string; leadName: string; meetingDate: IsoDate; discussed: string; agreed: string | null; createdAt: Date };
export type LetterRow = { id: string; personId: string; personName: string; kind: LetterKind; refNo: string; title: string; body: string; issuedOn: IsoDate; issuedByName: string | null; createdAt: Date };

export interface TalentRepository {
  internRecords(): Promise<InternRecordRow[]>;
  internRecord(personId: string): Promise<InternRecordRow | null>;
  createInternRecord(row: { id: string; personId: string; batch: string } & InternRecordWrite): Promise<void>;
  updateInternRecord(personId: string, patch: InternRecordWrite): Promise<void>;
  oneToOnes(personId: string): Promise<OneToOneRow[]>;
  /** Latest one-to-one per person (for "no one-to-one in six weeks"). */
  lastOneToOnes(): Promise<Array<{ personId: string; meetingDate: IsoDate }>>;
  findOneToOne(id: string): Promise<OneToOneRow | null>;
  addOneToOne(row: { id: string; personId: string; leadId: string; meetingDate: IsoDate; discussed: string; agreed: string | null }): Promise<void>;
  removeOneToOne(id: string, at: Date): Promise<void>;
  letters(personId?: string): Promise<LetterRow[]>;
  findLetter(id: string): Promise<LetterRow | null>;
  /** Inside a transaction: one letter numbered at a time in a year (parallel issues never share a number). */
  lockLetterNumbers(year: number): Promise<void>;
  /** Letters issued in a year, for the next reference number. */
  countLetters(year: number): Promise<number>;
  addLetter(row: { id: string; personId: string; kind: LetterKind; refNo: string; title: string; body: string; issuedOn: IsoDate; issuedById: string }): Promise<void>;
  removeLetter(id: string, at: Date): Promise<void>;
}
