import { sql } from "drizzle-orm";
import { check, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import {
  PROJECT_STATUSES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type ProjectStatus,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/types";
import { createdAt, id, oneOf, timestamps } from "./columns";
import { clients } from "./clients";
import { engagements } from "./engagements";
import { people } from "./people";
import { taskRecurrences } from "./work";

/** A piece of delivery inside an engagement, with stages. */
export const projects = pgTable(
  "projects",
  {
    id: id(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    /** Null only for internal projects that have no engagement. */
    engagementId: uuid("engagement_id").references(() => engagements.id),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").$type<ProjectStatus>().notNull().default("active"),
    currentStageId: uuid("current_stage_id").references((): AnyPgColumn => projectStages.id),
    leadId: uuid("lead_id").references(() => people.id),
    startDate: date("start_date"),
    dueDate: date("due_date"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdById: uuid("created_by_id").references(() => people.id),
    ...timestamps(),
  },
  (t) => [
    index("projects_client_idx").on(t.clientId),
    index("projects_engagement_idx").on(t.engagementId),
    check("projects_status_ck", oneOf(t.status, PROJECT_STATUSES)),
  ],
);

/** A project's own copy of its stages (D20). */
export const projectStages = pgTable(
  "project_stages",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references((): AnyPgColumn => projects.id),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    ...timestamps(),
  },
  (t) => [index("project_stages_project_idx").on(t.projectId, t.position)],
);

/** A promised output ("12 reels a month") counted against delivered tasks. */
export const deliverables = pgTable(
  "deliverables",
  {
    id: id(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id),
    projectId: uuid("project_id").references(() => projects.id),
    name: text("name").notNull(),
    /** Retainer: per calendar month. One-off: for the whole job. */
    targetCount: integer("target_count").notNull(),
    dueDate: date("due_date"),
    ...timestamps(),
  },
  (t) => [
    index("deliverables_engagement_idx").on(t.engagementId),
    check("deliverables_target_ck", sql`${t.targetCount} > 0`),
  ],
);

/** The unit of work. client_id is copied from the project so My Day and the Board never need a join to filter. */
export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    parentTaskId: uuid("parent_task_id").references((): AnyPgColumn => tasks.id),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").$type<TaskStatus>().notNull().default("todo"),
    priority: text("priority").$type<TaskPriority>().notNull().default("normal"),
    ownerId: uuid("owner_id").references(() => people.id),
    reviewerId: uuid("reviewer_id").references(() => people.id),
    stageId: uuid("stage_id").references(() => projectStages.id),
    deliverableId: uuid("deliverable_id").references(() => deliverables.id),
    startDate: date("start_date"),
    dueDate: date("due_date"),
    estimateMinutes: integer("estimate_minutes"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** Set when a recurring rule created this task (db/schema/work.ts). */
    recurrenceId: uuid("recurrence_id").references((): AnyPgColumn => taskRecurrences.id),
    /** The occurrence a recurring task stands for. Fixed at creation, so moving the due date never clashes. */
    recurrenceDate: date("recurrence_date"),
    /** Where an imported task came from, e.g. "clickup:86cv4x2pq", so importing again doesn't double up (D38). */
    externalId: text("external_id"),
    /** Ordering inside a board column (fractional rank string). */
    rank: text("rank").notNull().default("m"),
    /** The team's own labels on a task, e.g. "Urgent client", "Shoot" (Stage 9b). */
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    /** Custom field values by field id (Stage 9b.4): strings, numbers, booleans or ISO dates. */
    custom: jsonb("custom").$type<Record<string, string | number | boolean>>().notNull().default({}),
    createdById: uuid("created_by_id").references(() => people.id),
    ...timestamps(),
  },
  (t) => [
    // My Day: a person's open tasks by due date.
    index("tasks_owner_open_idx")
      .on(t.ownerId, t.dueDate)
      .where(sql`${t.deletedAt} is null and ${t.status} <> 'done'`),
    index("tasks_project_status_idx").on(t.projectId, t.status).where(sql`${t.deletedAt} is null`),
    index("tasks_client_status_idx").on(t.clientId, t.status).where(sql`${t.deletedAt} is null`),
    index("tasks_parent_idx").on(t.parentTaskId),
    index("tasks_tags_idx").using("gin", t.tags),
    // One live task per rule and occurrence. Deleted ones don't count, so a changed or resumed rule can fill it again.
    uniqueIndex("tasks_recurrence_date_uq").on(t.recurrenceId, t.recurrenceDate).where(sql`${t.recurrenceId} is not null and ${t.deletedAt} is null`),
    index("tasks_completed_idx").on(t.completedAt),
    uniqueIndex("tasks_external_uq").on(t.externalId).where(sql`${t.externalId} is not null and ${t.deletedAt} is null`),
    check("tasks_status_ck", oneOf(t.status, TASK_STATUSES)),
    check("tasks_priority_ck", oneOf(t.priority, TASK_PRIORITIES)),
    check("tasks_estimate_ck", sql`${t.estimateMinutes} is null or ${t.estimateMinutes} >= 0`),
    check("tasks_done_ck", sql`(${t.status} = 'done') = (${t.completedAt} is not null)`),
  ],
);

/** A person's saved task list filters and sort, shown as one-tap buttons (Stage 9b). */
export const taskViews = pgTable(
  "task_views",
  {
    id: id(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    name: text("name").notNull(),
    query: text("query").notNull(),
    createdAt: createdAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("task_views_person_idx").on(t.personId)],
);
