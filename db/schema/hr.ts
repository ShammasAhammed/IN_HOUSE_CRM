// HR slice 1: leave types and quotas, leave requests, grants (comp-off and adjustments), holidays, settings.
// Leave amounts are stored as whole half-days (1 day = 2), so balances never need decimals.
import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import {
  ATTENDANCE_LOCATIONS,
  CHECKLIST_KINDS,
  EMPLOYMENT_TYPES,
  HALF_DAYS,
  LEAVE_STATUSES,
  type AttendanceLocation,
  type ChecklistKind,
  type EmploymentType,
  type HalfDay,
  type LeaveStatus,
} from "@/lib/types";
import { createdAt, id, oneOf, timestamps } from "./columns";
import { clients } from "./clients";
import { people } from "./people";

export const leaveTypes = pgTable(
  "leave_types",
  {
    id: id(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    /** Unpaid leave has no balance to check (D46). */
    usesBalance: boolean("uses_balance").notNull().default(true),
    /** Comp-off: the balance comes only from grants, never from a yearly quota. */
    grantedOnly: boolean("granted_only").notNull().default(false),
    /** Days after granting that a grant expires (comp-off: 60). Null = never. */
    grantExpiryDays: integer("grant_expiry_days"),
    allowHalfDay: boolean("allow_half_day").notNull().default(true),
    /** How many days in the past someone may apply for themselves (sick: 7, D47). */
    maxBackdateDays: integer("max_backdate_days").notNull().default(0),
    position: integer("position").notNull().default(0),
    active: boolean("active").notNull().default(true),
    ...timestamps(),
  },
  (t) => [uniqueIndex("leave_types_key_uq").on(t.key).where(sql`${t.deletedAt} is null`)],
);

/** Yearly quota per leave type and employment type (D39). */
export const leaveQuotas = pgTable(
  "leave_quotas",
  {
    id: id(),
    leaveTypeId: uuid("leave_type_id")
      .notNull()
      .references(() => leaveTypes.id),
    employmentType: text("employment_type").$type<EmploymentType>().notNull(),
    halfDaysPerYear: integer("half_days_per_year").notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("leave_quotas_uq").on(t.leaveTypeId, t.employmentType).where(sql`${t.deletedAt} is null`),
    check("leave_quotas_employment_ck", oneOf(t.employmentType, EMPLOYMENT_TYPES)),
    check("leave_quotas_amount_ck", sql`${t.halfDaysPerYear} >= 0`),
  ],
);

export const leaveRequests = pgTable(
  "leave_requests",
  {
    id: id(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    leaveTypeId: uuid("leave_type_id")
      .notNull()
      .references(() => leaveTypes.id),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    /** Only for a single-day request. */
    halfDay: text("half_day").$type<HalfDay>(),
    reason: text("reason"),
    status: text("status").$type<LeaveStatus>().notNull().default("pending"),
    /** Who should decide: the person's manager, or the owner (D42). */
    approverId: uuid("approver_id").references(() => people.id),
    decidedById: uuid("decided_by_id").references(() => people.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    /** Approved leave cut short: days from this date on no longer count (D43). */
    cancelledFrom: date("cancelled_from"),
    /** A pending request to cut approved, already-started leave short from this date. */
    cancelRequestedFrom: date("cancel_requested_from"),
    /** Who created it, when HR or the owner records leave for someone else. */
    createdById: uuid("created_by_id").references(() => people.id),
    ...timestamps(),
  },
  (t) => [
    index("leave_requests_person_idx").on(t.personId, t.startDate),
    index("leave_requests_dates_idx").on(t.startDate, t.endDate).where(sql`${t.deletedAt} is null`),
    index("leave_requests_approver_idx").on(t.approverId, t.status),
    check("leave_requests_status_ck", oneOf(t.status, LEAVE_STATUSES)),
    check("leave_requests_range_ck", sql`${t.endDate} >= ${t.startDate}`),
    check("leave_requests_half_ck", sql`${t.halfDay} is null or (${oneOf(t.halfDay, HALF_DAYS)} and ${t.startDate} = ${t.endDate})`),
  ],
);

/** Comp-off grants and manual balance adjustments by HR (positive or negative). */
export const leaveGrants = pgTable(
  "leave_grants",
  {
    id: id(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    leaveTypeId: uuid("leave_type_id")
      .notNull()
      .references(() => leaveTypes.id),
    halfDays: integer("half_days").notNull(),
    grantedOn: date("granted_on").notNull(),
    expiresOn: date("expires_on"),
    reason: text("reason").notNull(),
    grantedById: uuid("granted_by_id").references(() => people.id),
    createdAt: createdAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("leave_grants_person_idx").on(t.personId, t.leaveTypeId),
    check("leave_grants_nonzero_ck", sql`${t.halfDays} <> 0`),
  ],
);

/** One published list per year (D49). */
export const holidays = pgTable(
  "holidays",
  {
    id: id(),
    date: date("date").notNull(),
    name: text("name").notNull(),
    ...timestamps(),
  },
  (t) => [uniqueIndex("holidays_date_uq").on(t.date).where(sql`${t.deletedAt} is null`)],
);

/** Small owner-editable settings, e.g. the working week (D32). */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedById: uuid("updated_by_id").references(() => people.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One attendance record per person per day (HR slice 2, D76): where they worked, when they checked in and out.
 * Location is optional and rough (thousandths of a degree, about 100 m): recorded, never enforced.
 */
export const attendanceDays = pgTable(
  "attendance_days",
  {
    id: id(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    workDate: date("work_date").notNull(),
    location: text("location").$type<AttendanceLocation>().notNull(),
    checkInAt: timestamp("check_in_at", { withTimezone: true }).notNull(),
    checkOutAt: timestamp("check_out_at", { withTimezone: true }),
    /** Time away between checking out and checking in again the same day (test report M1); not worked. */
    awayMinutes: integer("away_minutes").notNull().default(0),
    latMilli: integer("lat_milli"),
    lngMilli: integer("lng_milli"),
    note: text("note"),
    /** Set when HR or the owner recorded or corrected the day. */
    correctedById: uuid("corrected_by_id").references(() => people.id),
    correctionReason: text("correction_reason"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("attendance_days_person_date_uq").on(t.personId, t.workDate).where(sql`${t.deletedAt} is null`),
    index("attendance_days_date_idx").on(t.workDate),
    check("attendance_days_location_ck", oneOf(t.location, ATTENDANCE_LOCATIONS)),
    check("attendance_days_out_ck", sql`${t.checkOutAt} is null or ${t.checkOutAt} > ${t.checkInAt}`),
  ],
);

/**
 * The access register (HR slice 2): which person has which tool or client account, so an exit closes every one.
 * Never passwords — only what the access is and when it was given and taken away.
 */
export const accessGrants = pgTable(
  "access_grants",
  {
    id: id(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    /** The tool: "Google Workspace", "Meta Business Manager", "Canva" … */
    system: text("system").notNull(),
    /** Which account in it: "anjali@oppllo.com", "Zenith IAS ad account". */
    account: text("account"),
    /** For a client's own account (ad account, page, website login). */
    clientId: uuid("client_id").references(() => clients.id),
    /** "Admin", "Editor" … as the tool calls it. */
    level: text("level"),
    grantedOn: date("granted_on").notNull(),
    grantedById: uuid("granted_by_id").references(() => people.id),
    revokedOn: date("revoked_on"),
    revokedById: uuid("revoked_by_id").references(() => people.id),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [index("access_grants_person_idx").on(t.personId).where(sql`${t.deletedAt} is null`)],
);

/** One item of a person's joining or exit checklist. Items made from the access register point back at it. */
export const checklistItems = pgTable(
  "checklist_items",
  {
    id: id(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    kind: text("kind").$type<ChecklistKind>().notNull(),
    title: text("title").notNull(),
    position: integer("position").notNull(),
    /** "access:<grant id>", "client:<client id>" or "tasks" for exit items made from the person's work. */
    source: text("source"),
    doneAt: timestamp("done_at", { withTimezone: true }),
    doneById: uuid("done_by_id").references(() => people.id),
    ...timestamps(),
  },
  (t) => [
    index("checklist_items_person_idx").on(t.personId, t.kind).where(sql`${t.deletedAt} is null`),
    check("checklist_items_kind_ck", oneOf(t.kind, CHECKLIST_KINDS)),
  ],
);
