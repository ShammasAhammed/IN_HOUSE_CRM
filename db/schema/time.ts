import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, timestamps } from "./columns";
import { clients } from "./clients";
import { engagements } from "./engagements";
import { people } from "./people";
import { tasks } from "./projects";

/** Hours against a task. client_id and engagement_id are copied so retainer burn is one indexed sum. */
export const timeEntries = pgTable(
  "time_entries",
  {
    id: id(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    engagementId: uuid("engagement_id").references(() => engagements.id),
    workDate: date("work_date").notNull(),
    minutes: integer("minutes").notNull(),
    billable: boolean("billable").notNull().default(true),
    note: text("note"),
    ...timestamps(),
  },
  (t) => [
    index("time_entries_engagement_date_idx").on(t.engagementId, t.workDate).where(sql`${t.deletedAt} is null`),
    index("time_entries_person_date_idx").on(t.personId, t.workDate).where(sql`${t.deletedAt} is null`),
    index("time_entries_task_idx").on(t.taskId),
    check("time_entries_minutes_ck", sql`${t.minutes} > 0 and ${t.minutes} <= 1440`),
  ],
);

/** A running start/stop timer (Stage 9b.5): at most one per person. Stopping it logs the time on the task. */
export const timers = pgTable(
  "timers",
  {
    id: id(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    stoppedAt: timestamp("stopped_at", { withTimezone: true }),
    /** The time entry it became, when stopped with time to log. */
    timeEntryId: uuid("time_entry_id").references(() => timeEntries.id),
    createdAt: createdAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("timers_one_running_idx").on(t.personId).where(sql`${t.stoppedAt} is null and ${t.deletedAt} is null`)],
);
