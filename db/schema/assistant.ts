// The personal assistant (Stage 12.4): promises a person made in their own messages, and the day's plan summary.
// Both belong to one person and are read only by them.
import { sql } from "drizzle-orm";
import { check, date, index, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { PROMISE_SOURCES, PROMISE_STATUSES, type PromiseSource, type PromiseStatus } from "@/lib/types";
import { createdAt, id, oneOf } from "./columns";
import { people } from "./people";
import { tasks } from "./projects";

export const assistantPromises = pgTable(
  "assistant_promises",
  {
    id: id(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    source: text("source").$type<PromiseSource>().notNull(),
    /** The chat message or comment it was found in (one promise per message). */
    sourceId: uuid("source_id").notNull(),
    /** Where to open it again. */
    link: text("link").notNull(),
    /** The person's own words (their message), shortened. */
    excerpt: text("excerpt").notNull(),
    /** The helper's pick of when ("friday"), and the day worked out from it. */
    duePhrase: text("due_phrase"),
    dueOn: date("due_on"),
    status: text("status").$type<PromiseStatus>().notNull(),
    remindOn: date("remind_on"),
    remindedAt: timestamp("reminded_at", { withTimezone: true }),
    taskId: uuid("task_id").references(() => tasks.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("assistant_promises_source_uq").on(t.sourceId),
    index("assistant_promises_person_idx").on(t.personId, t.status),
    index("assistant_promises_remind_idx").on(t.remindOn).where(sql`${t.status} = 'reminder' and ${t.remindedAt} is null`),
    check("assistant_promises_source_ck", oneOf(t.source, PROMISE_SOURCES)),
    check("assistant_promises_status_ck", oneOf(t.status, PROMISE_STATUSES)),
  ],
);

/** The AI's one or two sentences on top of a morning plan: written once per person per day. */
export const assistantDaySummaries = pgTable(
  "assistant_day_summaries",
  {
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    day: date("day").notNull(),
    summary: text("summary").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.personId, t.day] })],
);
