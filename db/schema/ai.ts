// AI usage (Stage 9.1, D85): one row per question asked of the AI, with what it cost. The monthly spending limit is
// checked against these rows. Rows are a log: never edited, never deleted.
import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { LEAD_SCORES, type AiFeature, type AiOutcome, type LeadScore } from "@/lib/types";
import { createdAt, id, oneOf, paise } from "./columns";
import { leads } from "./leads";
import { people } from "./people";

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: id(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    feature: text("feature").$type<AiFeature>().notNull(),
    provider: text("provider").notNull(),
    /** The model that answered; with a safety fallback, the one that answered last. */
    model: text("model").notNull(),
    outcome: text("outcome").$type<AiOutcome>().notNull(),
    /** Calls to the model for this question (one per tool round). */
    calls: integer("calls").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    cacheWriteTokens: integer("cache_write_tokens").notNull(),
    cacheReadTokens: integer("cache_read_tokens").notNull(),
    /** What the provider charges, in millionths of a US dollar, and the same in paise at the rate on the day. */
    costMicroUsd: bigint("cost_micro_usd", { mode: "number" }).notNull(),
    costPaise: paise("cost_paise").notNull(),
    /** When an earlier model failed this question, that model (Stage 12.3: the router moved on). */
    escalatedFrom: text("escalated_from"),
    createdAt: createdAt(),
  },
  (t) => [index("ai_usage_created_idx").on(t.createdAt), index("ai_usage_person_idx").on(t.personId, t.createdAt)],
);

/**
 * The decision helper's read of a new lead (Stage 12.3): a hint for the sales team, kept apart from the lead itself,
 * so it never changes the lead's own score, stage or owner.
 */
export const leadAiScores = pgTable(
  "lead_ai_scores",
  {
    leadId: uuid("lead_id")
      .primaryKey()
      .references(() => leads.id),
    label: text("label").$type<LeadScore>().notNull(),
    /** 1 (poor fit) to 10 (ideal). */
    score: integer("score").notNull(),
    junk: boolean("junk").notNull(),
    /** How sure the helper was of the label, 0–100. */
    surePercent: integer("sure_percent").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    scoredAt: timestamp("scored_at", { withTimezone: true }).notNull(),
  },
  (t) => [check("lead_ai_scores_label_ck", oneOf(t.label, LEAD_SCORES)), check("lead_ai_scores_score_ck", sql`${t.score} between 1 and 10`)],
);
