// HR slice 3 (plan/4 "the intern engine", one-to-ones, letters).
import { sql } from "drizzle-orm";
import { boolean, check, date, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { HIRE_AGAIN, LETTER_KINDS, type HireAgain, type LetterKind } from "@/lib/types";
import { createdAt, id, oneOf, timestamps } from "./columns";
import { people } from "./people";

/** An intern's path: batch, mentor, the end review, and whether they stay in the talent pool. One per person. */
export const internRecords = pgTable(
  "intern_records",
  {
    id: id(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    /** "Oct 2026": interns who joined together. */
    batch: text("batch").notNull(),
    mentorId: uuid("mentor_id").references(() => people.id),
    plannedEndDate: date("planned_end_date"),
    /** What they are here to learn and do. */
    focus: text("focus"),
    strengths: text("strengths"),
    workedOn: text("worked_on"),
    hireAgain: text("hire_again").$type<HireAgain>(),
    reviewNotes: text("review_notes"),
    reviewedById: uuid("reviewed_by_id").references(() => people.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    inTalentPool: boolean("in_talent_pool").notNull().default(false),
    ...timestamps(),
  },
  (t) => [
    index("intern_records_person_idx").on(t.personId).where(sql`${t.deletedAt} is null`),
    check("intern_records_hire_again_ck", sql`${t.hireAgain} is null or ${oneOf(t.hireAgain, HIRE_AGAIN)}`),
  ],
);

/** A one-to-one: what was discussed and what was agreed. Seen by the person, the lead who held it, HR and the owner. */
export const oneToOnes = pgTable(
  "one_to_ones",
  {
    id: id(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => people.id),
    meetingDate: date("meeting_date").notNull(),
    discussed: text("discussed").notNull(),
    agreed: text("agreed"),
    ...timestamps(),
  },
  (t) => [index("one_to_ones_person_idx").on(t.personId, t.meetingDate)],
);

/** A letter as issued: the text is frozen at issue time, so later template edits never change an issued letter. */
export const letters = pgTable(
  "letters",
  {
    id: id(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    kind: text("kind").$type<LetterKind>().notNull(),
    refNo: text("ref_no").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    issuedOn: date("issued_on").notNull(),
    issuedById: uuid("issued_by_id").references(() => people.id),
    createdAt: createdAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("letters_person_idx").on(t.personId), uniqueIndex("letters_ref_idx").on(t.refNo), check("letters_kind_ck", oneOf(t.kind, LETTER_KINDS))],
);
