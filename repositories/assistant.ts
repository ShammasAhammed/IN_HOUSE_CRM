// The personal assistant's own records (Stage 12.4): a person's promises and the day's plan summary. Every read is by
// the person's own id: nobody else's promises or summaries are ever listed.
import type { IsoDate } from "@/lib/dates";
import type { PromiseSource, PromiseStatus } from "@/lib/types";

export type PromiseRecord = {
  id: string;
  personId: string;
  source: PromiseSource;
  sourceId: string;
  link: string;
  excerpt: string;
  duePhrase: string | null;
  dueOn: IsoDate | null;
  status: PromiseStatus;
  remindOn: IsoDate | null;
  remindedAt: Date | null;
  taskId: string | null;
  decidedAt: Date | null;
  createdAt: Date;
};

export interface AssistantRepository {
  /** False when that message already has a promise. */
  addPromise(row: Omit<PromiseRecord, "remindOn" | "remindedAt" | "taskId" | "decidedAt" | "createdAt" | "status">, at: Date): Promise<boolean>;
  /** This person's promises with these statuses, soonest due first. */
  promises(personId: string, statuses: readonly PromiseStatus[]): Promise<PromiseRecord[]>;
  findPromise(id: string, personId: string): Promise<PromiseRecord | null>;
  /** Only while it is still open or a reminder: false when someone already decided. */
  decidePromise(id: string, personId: string, patch: { status: PromiseStatus; remindOn?: IsoDate | null; taskId?: string | null }, at: Date): Promise<boolean>;
  /** Reminders due by `day` that haven't been sent. */
  dueReminders(day: IsoDate): Promise<PromiseRecord[]>;
  markReminded(ids: readonly string[], at: Date): Promise<void>;
  daySummary(personId: string, day: IsoDate): Promise<string | null>;
  saveDaySummary(personId: string, day: IsoDate, summary: string): Promise<void>;
}
