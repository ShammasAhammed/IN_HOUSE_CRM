// Attendance (HR slice 2): one record per person per day.
import type { IsoDate } from "@/lib/dates";
import type { AttendanceLocation } from "@/lib/types";

export type AttendanceRecord = {
  id: string;
  personId: string;
  workDate: IsoDate;
  location: AttendanceLocation;
  checkInAt: Date;
  checkOutAt: Date | null;
  awayMinutes: number;
  latMilli: number | null;
  lngMilli: number | null;
  note: string | null;
  correctedById: string | null;
  correctionReason: string | null;
};

export type AttendanceWrite = Omit<AttendanceRecord, "id">;

export interface AttendanceRepository {
  findDay(personId: string, workDate: IsoDate): Promise<AttendanceRecord | null>;
  /** Live records in [from, to], for these people or everyone. */
  list(filter: { personIds?: readonly string[]; from: IsoDate; to: IsoDate }): Promise<AttendanceRecord[]>;
  /** Open days (checked in, not out) before `before`, newest first. */
  listOpen(personId: string, before: IsoDate, limit: number): Promise<AttendanceRecord[]>;
  create(id: string, row: AttendanceWrite): Promise<void>;
  update(id: string, patch: Partial<AttendanceWrite> & { deletedAt?: Date }): Promise<void>;
}
