// Projects slice 1: comments on tasks and recurring task rules (decision D35).
import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { RECURRENCE_FREQUENCIES, TASK_PRIORITIES, type RecurrenceFrequency, type TaskPriority } from "@/lib/types";
import { id, oneOf, timestamps } from "./columns";
import { clients } from "./clients";
import { people } from "./people";
import { deliverables, projectStages, projects, tasks } from "./projects";

export const taskComments = pgTable(
  "task_comments",
  {
    id: id(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id),
    authorId: uuid("author_id")
      .notNull()
      .references(() => people.id),
    body: text("body").notNull(),
    ...timestamps(),
  },
  (t) => [index("task_comments_task_idx").on(t.taskId, t.createdAt), check("task_comments_body_ck", sql`length(${t.body}) between 1 and 5000`)],
);

/**
 * A rule that creates a task every week or month ("Monthly performance report", "Weekly ad check").
 * A daily job creates the tasks 14 days ahead; tasks.recurrence_id + due_date is unique, so re-running is safe.
 */
export const taskRecurrences = pgTable(
  "task_recurrences",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    title: text("title").notNull(),
    description: text("description"),
    ownerId: uuid("owner_id").references(() => people.id),
    reviewerId: uuid("reviewer_id").references(() => people.id),
    priority: text("priority").$type<TaskPriority>().notNull().default("normal"),
    stageId: uuid("stage_id").references(() => projectStages.id),
    deliverableId: uuid("deliverable_id").references(() => deliverables.id),
    estimateMinutes: integer("estimate_minutes"),
    frequency: text("frequency").$type<RecurrenceFrequency>().notNull(),
    /** Weekly: 1 = Monday … 6 = Saturday. */
    weekday: integer("weekday"),
    /** Monthly: 1–28, or 31 for the last working day of the month. */
    dayOfMonth: integer("day_of_month"),
    /** The task starts this many working days before it is due. */
    leadWorkingDays: integer("lead_working_days").notNull().default(1),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on"),
    active: boolean("active").notNull().default(true),
    /** Tasks exist up to this due date. */
    generatedUntil: date("generated_until"),
    createdById: uuid("created_by_id").references(() => people.id),
    ...timestamps(),
  },
  (t) => [
    index("task_recurrences_project_idx").on(t.projectId),
    check("task_recurrences_frequency_ck", oneOf(t.frequency, RECURRENCE_FREQUENCIES)),
    check("task_recurrences_priority_ck", oneOf(t.priority, TASK_PRIORITIES)),
    check(
      "task_recurrences_when_ck",
      sql`(${t.frequency} = 'weekly' and ${t.weekday} between 1 and 6) or (${t.frequency} = 'monthly' and (${t.dayOfMonth} between 1 and 28 or ${t.dayOfMonth} = 31))`,
    ),
  ],
);
