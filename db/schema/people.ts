import { sql } from "drizzle-orm";
import { check, date, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import {
  EMPLOYMENT_TYPES,
  PERSON_STATUSES,
  ROLES,
  WORK_LOCATIONS,
  type EmploymentType,
  type PersonStatus,
  type Role,
  type WorkLocation,
} from "@/lib/types";
import { createdAt, id, oneOf, timestamps } from "./columns";

export const departments = pgTable(
  "departments",
  {
    id: id(),
    name: text("name").notNull(),
    /** The team head. Team heads are a relationship, not a role (decision D12). */
    headPersonId: uuid("head_person_id").references((): AnyPgColumn => people.id),
    ...timestamps(),
  },
  (t) => [uniqueIndex("departments_name_uq").on(t.name).where(sql`${t.deletedAt} is null`)],
);

export const people = pgTable(
  "people",
  {
    id: id(),
    fullName: text("full_name").notNull(),
    /** The Google account used to sign in. */
    workEmail: text("work_email").notNull(),
    workPhone: text("work_phone"),
    personalEmail: text("personal_email"),
    personalPhone: text("personal_phone"),
    emergencyContactName: text("emergency_contact_name"),
    emergencyContactPhone: text("emergency_contact_phone"),
    emergencyContactRelation: text("emergency_contact_relation"),
    departmentId: uuid("department_id").references(() => departments.id),
    reportsToId: uuid("reports_to_id").references((): AnyPgColumn => people.id),
    jobTitle: text("job_title").notNull(),
    employmentType: text("employment_type").$type<EmploymentType>().notNull(),
    workLocation: text("work_location").$type<WorkLocation>().notNull().default("office"),
    joinDate: date("join_date").notNull(),
    endDate: date("end_date"),
    /** Feeds the Projects capacity view. */
    capacityMinutesPerWeek: integer("capacity_minutes_per_week").notNull(),
    status: text("status").$type<PersonStatus>().notNull().default("active"),
    avatarUrl: text("avatar_url"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("people_work_email_uq").on(sql`lower(${t.workEmail})`).where(sql`${t.deletedAt} is null`),
    check("people_employment_type_ck", oneOf(t.employmentType, EMPLOYMENT_TYPES)),
    check("people_work_location_ck", oneOf(t.workLocation, WORK_LOCATIONS)),
    check("people_status_ck", oneOf(t.status, PERSON_STATUSES)),
    check("people_capacity_ck", sql`${t.capacityMinutesPerWeek} >= 0 and ${t.capacityMinutesPerWeek} <= 4800`),
  ],
);

/** A person may hold several roles; permissions are the union (decision D11). */
export const personRoles = pgTable(
  "person_roles",
  {
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    role: text("role").$type<Role>().notNull(),
    createdAt: createdAt(),
    /** Taking a role away is a soft delete; giving it back clears it. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.personId, t.role] }), check("person_roles_role_ck", oneOf(t.role, ROLES))],
);

