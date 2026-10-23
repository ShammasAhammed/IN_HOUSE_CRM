// Results per client (Stage 11.1): one row of numbers per client per month, typed in or pre-filled from Meta, with the
// month's targets. The engagement is the retainer the month belonged to, when there was exactly one.
import { sql } from "drizzle-orm";
import { check, date, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { RESULT_SOURCES, type ResultSource } from "@/lib/types";
import { clients } from "./clients";
import { createdAt, id, oneOf, paise, updatedAt } from "./columns";
import { engagements } from "./engagements";
import { people } from "./people";

export const clientResults = pgTable(
  "client_results",
  {
    id: id(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    engagementId: uuid("engagement_id").references(() => engagements.id),
    /** The first day of the month. */
    month: date("month").notNull(),
    /** Null = not entered yet (different from zero). */
    leads: integer("leads"),
    spendPaise: paise("spend_paise"),
    callsBooked: integer("calls_booked"),
    admissions: integer("admissions"),
    targetLeads: integer("target_leads"),
    targetAdmissions: integer("target_admissions"),
    leadsSource: text("leads_source").$type<ResultSource>().notNull().default("manual"),
    spendSource: text("spend_source").$type<ResultSource>().notNull().default("manual"),
    updatedById: uuid("updated_by_id").references(() => people.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("client_results_month_uq").on(t.clientId, t.month),
    check("client_results_month_ck", sql`extract(day from ${t.month}) = 1`),
    check(
      "client_results_counts_ck",
      sql`coalesce(${t.leads}, 0) >= 0 and coalesce(${t.spendPaise}, 0) >= 0 and coalesce(${t.callsBooked}, 0) >= 0 and coalesce(${t.admissions}, 0) >= 0 and coalesce(${t.targetLeads}, 0) >= 0 and coalesce(${t.targetAdmissions}, 0) >= 0`,
    ),
    check("client_results_leads_source_ck", oneOf(t.leadsSource, RESULT_SOURCES)),
    check("client_results_spend_source_ck", oneOf(t.spendSource, RESULT_SOURCES)),
  ],
);
