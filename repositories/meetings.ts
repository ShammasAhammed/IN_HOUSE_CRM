// Meetings (Stage 13.4): each one a page plus when, who, what kind and how it repeats.
import type { IsoDate } from "@/lib/dates";
import type { MeetingKind, MeetingRepeat } from "@/lib/types";

export type MeetingRecord = {
  id: string;
  docId: string;
  title: string;
  body: string;
  docVersion: number;
  clientId: string | null;
  clientName: string | null;
  projectId: string | null;
  kind: MeetingKind;
  meetingDate: IsoDate;
  startTime: string | null;
  attendees: string[];
  repeat: MeetingRepeat;
  previousId: string | null;
  nextId: string | null;
  createdById: string | null;
  createdAt: Date;
};

export type MeetingFilter = { clientIds: readonly string[] | "all"; clientId?: string | null; kind?: MeetingKind; from?: IsoDate; to?: IsoDate; attendee?: string; limit?: number };

export interface MeetingsRepository {
  create(row: { id: string; docId: string; clientId: string | null; projectId: string | null; kind: MeetingKind; meetingDate: IsoDate; startTime: string | null; attendees: string[]; repeat: MeetingRepeat; previousId: string | null; createdById: string; at: Date }): Promise<void>;
  find(id: string): Promise<MeetingRecord | null>;
  byDoc(docId: string): Promise<MeetingRecord | null>;
  /** Newest first; team meetings (no client) always included with `clientIds`. */
  list(filter: MeetingFilter): Promise<MeetingRecord[]>;
  update(id: string, patch: Partial<Pick<MeetingRecord, "kind" | "meetingDate" | "startTime" | "attendees" | "repeat" | "projectId" | "nextId">> & { at: Date }): Promise<void>;
  /** Repeating meetings held before today with no next one yet (the daily job makes it, carrying what was written). */
  dueRepeats(today: IsoDate): Promise<MeetingRecord[]>;
  actions(meetingId: string): Promise<Array<{ itemKey: string; taskId: string }>>;
  /** False when that item already became a task. */
  addAction(row: { id: string; meetingId: string; itemKey: string; taskId: string; createdById: string; at: Date }): Promise<boolean>;
}
