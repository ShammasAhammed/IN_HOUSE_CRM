// Leave, holidays and the working calendar.
import type { IsoDate } from "@/lib/dates";
import type { EmploymentType, HalfDay, LeaveStatus } from "@/lib/types";

export type LeaveTypeRecord = {
  id: string;
  key: string;
  name: string;
  usesBalance: boolean;
  grantedOnly: boolean;
  grantExpiryDays: number | null;
  allowHalfDay: boolean;
  maxBackdateDays: number;
  active: boolean;
  /** Yearly quota in half-days, per employment type. Missing = 0. */
  quotas: Partial<Record<EmploymentType, number>>;
};

export type LeaveRequestRecord = {
  id: string;
  personId: string;
  personName: string;
  departmentId: string | null;
  departmentName: string | null;
  leaveTypeId: string;
  leaveTypeName: string;
  startDate: IsoDate;
  endDate: IsoDate;
  halfDay: HalfDay | null;
  reason: string | null;
  status: LeaveStatus;
  approverId: string | null;
  approverName: string | null;
  decidedById: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  cancelledFrom: IsoDate | null;
  cancelRequestedFrom: IsoDate | null;
  createdById: string | null;
  createdAt: Date;
};

export type LeaveRequestWrite = {
  personId: string;
  leaveTypeId: string;
  startDate: IsoDate;
  endDate: IsoDate;
  halfDay: HalfDay | null;
  reason: string | null;
  status: LeaveStatus;
  approverId: string | null;
  decidedById: string | null;
  decidedAt: Date | null;
  createdById: string;
};

export type LeaveRequestPatch = Partial<{
  approverId: string | null;
  status: LeaveStatus;
  decidedById: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  cancelledFrom: IsoDate | null;
  cancelRequestedFrom: IsoDate | null;
}>;

export type LeaveGrantRecord = {
  id: string;
  personId: string;
  leaveTypeId: string;
  halfDays: number;
  grantedOn: IsoDate;
  expiresOn: IsoDate | null;
  reason: string;
};

export type LeaveRequestFilter = {
  personIds?: readonly string[];
  approverId?: string;
  statuses?: readonly LeaveStatus[];
  /** Requests touching this date range (by their full span). */
  overlapping?: { from: IsoDate; to: IsoDate };
  leaveTypeId?: string;
  /** Pending requests to cut approved leave short. */
  withCancelRequest?: boolean;
};

export interface LeaveRepository {
  listTypes(): Promise<LeaveTypeRecord[]>;
  createType(row: { id: string; key: string; name: string; usesBalance: boolean; grantedOnly: boolean; grantExpiryDays: number | null; allowHalfDay: boolean; maxBackdateDays: number; position: number }): Promise<void>;
  findType(id: string): Promise<LeaveTypeRecord | null>;
  updateType(id: string, patch: Partial<Pick<LeaveTypeRecord, "name" | "allowHalfDay" | "maxBackdateDays" | "grantExpiryDays" | "active">>): Promise<void>;
  setQuota(leaveTypeId: string, employmentType: EmploymentType, halfDaysPerYear: number): Promise<void>;

  listRequests(filter: LeaveRequestFilter): Promise<LeaveRequestRecord[]>;
  findRequest(id: string): Promise<LeaveRequestRecord | null>;
  createRequest(id: string, request: LeaveRequestWrite): Promise<void>;
  updateRequest(id: string, patch: LeaveRequestPatch): Promise<void>;
  /** Update only if the request is still in `expected` status; false when someone else changed it first. */
  updateRequestIf(id: string, expected: LeaveStatus, patch: LeaveRequestPatch): Promise<boolean>;

  listGrants(personIds: readonly string[]): Promise<LeaveGrantRecord[]>;
  createGrant(id: string, grant: Omit<LeaveGrantRecord, "id"> & { grantedById: string }): Promise<void>;
}

export type HolidayRecord = { id: string; date: IsoDate; name: string };

export interface CalendarRepository {
  listHolidays(from: IsoDate, to: IsoDate): Promise<HolidayRecord[]>;
  findHolidayOn(date: IsoDate): Promise<HolidayRecord | null>;
  addHoliday(id: string, date: IsoDate, name: string): Promise<void>;
  removeHoliday(id: string): Promise<HolidayRecord | null>;
  getSetting<T>(key: string): Promise<T | null>;
  /** `updatedById` is null when the system set it (e.g. copied from the CRM). */
  setSetting(key: string, value: unknown, updatedById: string | null): Promise<void>;
}
