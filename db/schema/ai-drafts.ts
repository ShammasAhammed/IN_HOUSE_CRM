// AI teammates (Stage 11.3): a draft the AI wrote for a task (caption, brief, first script, report prep). It never acts
// on its own: a person who can change the task approves (possibly edited) or rejects it. What the run cost is the
// ai_usage row it points at.
import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { AI_DRAFT_KINDS, AI_DRAFT_STATUSES, type AiDraftKind, type AiDraftStatus } from "@/lib/types";
import { aiUsage } from "./ai";
import { clients } from "./clients";
import { createdAt, id, oneOf, updatedAt } from "./columns";
import { people } from "./people";
import { tasks } from "./projects";

export const aiDrafts = pgTable(
  "ai_drafts",
  {
    id: id(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    kind: text("kind").$type<AiDraftKind>().notNull(),
    /** What the person asked for, in their words. */
    instructions: text("instructions"),
    /** The AI's text; on approval, the approved (possibly edited) text. */
    body: text("body").notNull(),
    status: text("status").$type<AiDraftStatus>().notNull().default("draft"),
    requestedById: uuid("requested_by_id")
      .notNull()
      .references(() => people.id),
    aiUsageId: uuid("ai_usage_id").references(() => aiUsage.id),
    reviewedById: uuid("reviewed_by_id").references(() => people.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("ai_drafts_task_idx").on(t.taskId, t.createdAt),
    check("ai_drafts_kind_ck", oneOf(t.kind, AI_DRAFT_KINDS)),
    check("ai_drafts_status_ck", oneOf(t.status, AI_DRAFT_STATUSES)),
    check("ai_drafts_reviewed_ck", sql`(${t.status} = 'draft') = (${t.reviewedAt} is null)`),
  ],
);
