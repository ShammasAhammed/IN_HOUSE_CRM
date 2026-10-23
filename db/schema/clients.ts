import { sql } from "drizzle-orm";
import { boolean, check, date, index, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { ACCESS_LEVELS, ACCESS_REQUEST_STATUSES, CLIENT_SEGMENTS, CLIENT_STATUSES, type AccessLevel, type AccessRequestStatus, type ClientSegment, type ClientStatus, type TwoStepAnswer } from "@/lib/types";
import { createdAt, id, oneOf, timestamps, updatedAt } from "./columns";
import { people } from "./people";

export const clients = pgTable(
  "clients",
  {
    id: id(),
    name: text("name").notNull(),
    legalName: text("legal_name"),
    segment: text("segment").$type<ClientSegment>().notNull().default("other"),
    city: text("city"),
    status: text("status").$type<ClientStatus>().notNull().default("onboarding"),
    startDate: date("start_date"),
    gstin: text("gstin"),
    billingAddress: text("billing_address"),
    /** The won lead in the Firebase CRM this client came from, if any. */
    crmLeadId: text("crm_lead_id"),
    leadStrategistId: uuid("lead_strategist_id").references(() => people.id),
    /** Oppllo's own internal work, which has no budget. */
    isInternal: boolean("is_internal").notNull().default(false),
    /** A private space (Stage 14.1): only its members and the owner see it and anything in it. Internal only. */
    isPrivate: boolean("is_private").notNull().default(false),
    /** Stage 14.2: grants need both the owner and HR (private spaces always do). Internal only. */
    isSensitive: boolean("is_sensitive").notNull().default(false),
    /** Stage 14.5: the space that is Oppllo's own marketing ("Oppllo as its own client"): results, reports. One only. */
    isSelf: boolean("is_self").notNull().default(false),
    /** Stage 14.2: when the owner last reviewed this space's members (every 90 days). */
    accessReviewedAt: timestamp("access_reviewed_at", { withTimezone: true }),
    notes: text("notes"),
    /** The client's Google Drive folder (ops extra), once made. */
    driveFolderId: text("drive_folder_id"),
    driveFolderUrl: text("drive_folder_url"),
    /** The client's contact in Zoho Books, made with their first invoice. */
    zohoContactId: text("zoho_contact_id"),
    ...timestamps(),
  },
  (t) => [
    check("clients_segment_ck", oneOf(t.segment, CLIENT_SEGMENTS)),
    check("clients_status_ck", oneOf(t.status, CLIENT_STATUSES)),
    check("clients_private_internal_ck", sql`not ${t.isPrivate} or ${t.isInternal}`),
    check("clients_sensitive_internal_ck", sql`not ${t.isSensitive} or ${t.isInternal}`),
    check("clients_self_internal_ck", sql`not ${t.isSelf} or ${t.isInternal}`),
    uniqueIndex("clients_one_self_uq").on(t.isSelf).where(sql`${t.isSelf}`),
    index("clients_name_idx").on(t.name).where(sql`${t.deletedAt} is null`),
  ],
);

/** Contact people at the client. Contact details are restricted by role (decision D14). */
export const clientContacts = pgTable(
  "client_contacts",
  {
    id: id(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    name: text("name").notNull(),
    designation: text("designation"),
    phone: text("phone"),
    email: text("email"),
    whatsapp: text("whatsapp"),
    isPrimary: boolean("is_primary").notNull().default(false),
    ...timestamps(),
  },
  (t) => [index("client_contacts_client_idx").on(t.clientId)],
);

/** The Oppllo team working on a client. */
export const clientMembers = pgTable(
  "client_members",
  {
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    note: text("note"),
    /** Stage 14.2: what a space member may do (D-14.2a); client teams keep "edit". */
    level: text("level").$type<AccessLevel>().notNull().default("edit"),
    /** Stage 14.2: the last day of access (India day), or none. Membership checks treat a past date as gone. */
    expiresOn: date("expires_on"),
    /** Stage 14.2: the approved and confirmed request this access came from; null for client teams and carry-overs. */
    requestId: uuid("request_id"),
    createdAt: createdAt(),
    /** Removing someone from a team is a soft delete; re-adding clears it. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.clientId, t.personId] }), index("client_members_person_idx").on(t.personId), check("client_members_level_ck", oneOf(t.level, ACCESS_LEVELS))],
);

/**
 * Stage 14.2: asking for someone's access to a space. The owner or HR asks; the other one approves or refuses; the
 * member reads what they get and presses "I understand", and only then is the membership made.
 */
export const spaceAccessRequests = pgTable(
  "space_access_requests",
  {
    id: id(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => clients.id),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    level: text("level").$type<AccessLevel>().notNull(),
    reason: text("reason").notNull(),
    expiresOn: date("expires_on"),
    twoStep: text("two_step").$type<TwoStepAnswer>(),
    status: text("status").$type<AccessRequestStatus>().notNull().default("pending"),
    requestedById: uuid("requested_by_id")
      .notNull()
      .references(() => people.id),
    decidedById: uuid("decided_by_id").references(() => people.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    /** D-14.2b: approved by the owner alone because there was no HR person to be the second. */
    ownerAlone: boolean("owner_alone").notNull().default(false),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("space_access_requests_person_idx").on(t.personId),
    uniqueIndex("space_access_requests_open_uq").on(t.spaceId, t.personId).where(sql`${t.status} in ('pending', 'approved')`),
    check("space_access_requests_level_ck", oneOf(t.level, ACCESS_LEVELS)),
    check("space_access_requests_status_ck", oneOf(t.status, ACCESS_REQUEST_STATUSES)),
    check("space_access_requests_two_step_ck", sql`${t.twoStep} is null or ${t.twoStep} in ('yes', 'not_sure')`),
  ],
);
