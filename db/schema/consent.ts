// DPDP consent records (Stage 11.7): what a lead or a team member agreed to, when and how, and when and how they
// withdrew it. Never edited or deleted: a withdrawal is recorded on the same row, and a new consent is a new row.
import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { CONSENT_METHODS, CONSENT_SUBJECTS, type ConsentMethod, type ConsentSubject } from "@/lib/types";
import { createdAt, id, oneOf } from "./columns";
import { people } from "./people";

export const consentRecords = pgTable(
  "consent_records",
  {
    id: id(),
    subjectType: text("subject_type").$type<ConsentSubject>().notNull(),
    /** The lead's or the person's id. */
    subjectId: uuid("subject_id").notNull(),
    /** What was agreed, in plain words ("Calls and WhatsApp about admissions"). */
    purpose: text("purpose").notNull(),
    method: text("method").$type<ConsentMethod>().notNull(),
    givenAt: timestamp("given_at", { withTimezone: true }).notNull(),
    note: text("note"),
    /** Null when the system recorded it (a landing-page form). */
    recordedById: uuid("recorded_by_id").references(() => people.id),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    withdrawnMethod: text("withdrawn_method").$type<ConsentMethod>(),
    withdrawnNote: text("withdrawn_note"),
    withdrawnById: uuid("withdrawn_by_id").references(() => people.id),
    createdAt: createdAt(),
  },
  (t) => [
    index("consent_records_subject_idx").on(t.subjectType, t.subjectId),
    check("consent_records_subject_ck", oneOf(t.subjectType, CONSENT_SUBJECTS)),
    check("consent_records_method_ck", oneOf(t.method, CONSENT_METHODS)),
    check("consent_records_withdrawn_ck", sql`(${t.withdrawnAt} is null) = (${t.withdrawnMethod} is null)`),
  ],
);
