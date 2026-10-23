// Monthly client reports (Stage 11.4): one per client per month. The numbers are a snapshot taken from the data
// (results, Meta ads, deliverables, tasks, creatives, posts), never from the AI; the words around them are the AI's
// draft or a person's, edited by a person. Final reports are frozen.
import { sql } from "drizzle-orm";
import { check, date, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { REPORT_STATUSES, type ReportStatus } from "@/lib/types";
import { aiUsage } from "./ai";
import { clients } from "./clients";
import { createdAt, id, oneOf, updatedAt } from "./columns";
import { people } from "./people";

export const clientReports = pgTable(
  "client_reports",
  {
    id: id(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    /** The first day of the month reported on. */
    month: date("month").notNull(),
    status: text("status").$type<ReportStatus>().notNull().default("draft"),
    /** The numbers, gathered by the service (services/reports.ts ReportFacts). */
    facts: jsonb("facts").$type<unknown>().notNull(),
    summary: text("summary").notNull().default(""),
    wentWell: text("went_well").notNull().default(""),
    nextSteps: text("next_steps").notNull().default(""),
    /** The last AI run that wrote the words, if any. */
    aiUsageId: uuid("ai_usage_id").references(() => aiUsage.id),
    /** Two people editing at once: the second save is refused. */
    version: integer("version").notNull().default(1),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => people.id),
    updatedById: uuid("updated_by_id").references(() => people.id),
    finalizedById: uuid("finalized_by_id").references(() => people.id),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("client_reports_month_uq").on(t.clientId, t.month),
    check("client_reports_month_ck", sql`extract(day from ${t.month}) = 1`),
    check("client_reports_status_ck", oneOf(t.status, REPORT_STATUSES)),
    check("client_reports_final_ck", sql`(${t.status} = 'final') = (${t.finalizedAt} is not null)`),
  ],
);
