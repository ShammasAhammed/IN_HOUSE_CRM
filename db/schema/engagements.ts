import { sql } from "drizzle-orm";
import { check, date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import {
  ENGAGEMENT_KINDS,
  ENGAGEMENT_STATUSES,
  PERIOD_STATUSES,
  ROLLOVER_POLICIES,
  type EngagementKind,
  type EngagementStatus,
  type PeriodStatus,
  type RolloverPolicy,
} from "@/lib/types";
import { createdAt, id, oneOf, paise, timestamps } from "./columns";
import { clients } from "./clients";
import { people } from "./people";
import { services } from "./services";

/**
 * One retainer or one-off job. Sits between client and project and holds the budget —
 * this is what makes retainer burn and renewals possible (Projects module, rule 1).
 */
export const engagements = pgTable(
  "engagements",
  {
    id: id(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id),
    kind: text("kind").$type<EngagementKind>().notNull(),
    name: text("name").notNull(),
    status: text("status").$type<EngagementStatus>().notNull().default("active"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    renewalDate: date("renewal_date"),
    /** Retainer: hours per calendar month. One-off: hours for the whole job (D22, D27). */
    hoursBudgetMinutes: integer("hours_budget_minutes").notNull().default(0),
    rolloverPolicy: text("rollover_policy").$type<RolloverPolicy>().notNull().default("expire"),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    index("engagements_client_idx").on(t.clientId),
    check("engagements_kind_ck", oneOf(t.kind, ENGAGEMENT_KINDS)),
    check("engagements_status_ck", oneOf(t.status, ENGAGEMENT_STATUSES)),
    check("engagements_rollover_ck", oneOf(t.rolloverPolicy, ROLLOVER_POLICIES)),
    check("engagements_budget_ck", sql`${t.hoursBudgetMinutes} >= 0`),
  ],
);

/** Fee history: retainer = monthly fee, one-off = total fee. Excluding GST (D28). */
export const engagementFees = pgTable(
  "engagement_fees",
  {
    id: id(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id),
    amountPaise: paise("amount_paise").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    createdById: uuid("created_by_id").references(() => people.id),
    createdAt: createdAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("engagement_fees_engagement_idx").on(t.engagementId, t.effectiveFrom),
    // One live fee per start date: a second change for the same date replaces the first.
    uniqueIndex("engagement_fees_uq").on(t.engagementId, t.effectiveFrom).where(sql`${t.deletedAt} is null`),
    check("engagement_fees_amount_ck", sql`${t.amountPaise} >= 0`),
  ],
);

/** One calendar month of a retainer: the budget it opened with and whether warnings fired (D22–D25). */
export const engagementPeriods = pgTable(
  "engagement_periods",
  {
    id: id(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    /** Prorated for a mid-month start. */
    baseBudgetMinutes: integer("base_budget_minutes").notNull(),
    rolloverInMinutes: integer("rollover_in_minutes").notNull().default(0),
    feePaise: paise("fee_paise").notNull(),
    status: text("status").$type<PeriodStatus>().notNull().default("open"),
    warned80At: timestamp("warned_80_at", { withTimezone: true }),
    warned100At: timestamp("warned_100_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    // One live period per month; a removed one doesn't block reopening the month.
    uniqueIndex("engagement_periods_uq").on(t.engagementId, t.periodStart).where(sql`${t.deletedAt} is null`),
    check("engagement_periods_status_ck", oneOf(t.status, PERIOD_STATUSES)),
    check("engagement_periods_range_ck", sql`${t.periodEnd} >= ${t.periodStart}`),
  ],
);
