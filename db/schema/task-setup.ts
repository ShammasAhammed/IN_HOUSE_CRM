// How the agency shapes its tasks (Stage 9b.4): custom fields on tasks, and templates for tasks and projects.
import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { TASK_FIELD_KINDS, TEMPLATE_KINDS, type TaskFieldKind, type TemplateKind } from "@/lib/types";
import { clients } from "./clients";
import { createdAt, id, oneOf, timestamps } from "./columns";
import { projects, tasks } from "./projects";
import { people } from "./people";

/** A field every task can carry (or only one client's tasks): "Shoot location", "Ad budget", "Language". */
export const taskFields = pgTable(
  "task_fields",
  {
    id: id(),
    name: text("name").notNull(),
    kind: text("kind").$type<TaskFieldKind>().notNull(),
    /** Choices for a dropdown. */
    options: text("options").array().notNull().default(sql`'{}'::text[]`),
    /** Null: on every client's tasks. */
    clientId: uuid("client_id").references(() => clients.id),
    position: integer("position").notNull().default(0),
    createdById: uuid("created_by_id").references(() => people.id),
    ...timestamps(),
  },
  (t) => [check("task_fields_kind_ck", oneOf(t.kind, TASK_FIELD_KINDS)), index("task_fields_client_idx").on(t.clientId)],
);

/** A saved task or project to start from: what it holds is in `data` (shape set by services/templates.ts). */
export const templates = pgTable(
  "templates",
  {
    id: id(),
    kind: text("kind").$type<TemplateKind>().notNull(),
    name: text("name").notNull(),
    description: text("description"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    createdById: uuid("created_by_id").references(() => people.id),
    ...timestamps(),
  },
  (t) => [check("templates_kind_ck", oneOf(t.kind, TEMPLATE_KINDS)), index("templates_kind_idx").on(t.kind)],
);

/** A request form (Stage 9b.5): each submission becomes a task in `projectId`. Questions are in `questions`. */
export const requestForms = pgTable(
  "request_forms",
  {
    id: id(),
    name: text("name").notNull(),
    description: text("description"),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    ownerId: uuid("owner_id").references(() => people.id),
    questions: jsonb("questions").$type<Array<Record<string, unknown>>>().notNull(),
    active: boolean("active").notNull().default(true),
    /** Set: anyone with the link /r/<slug> may submit, without signing in. */
    publicSlug: text("public_slug"),
    createdById: uuid("created_by_id").references(() => people.id),
    ...timestamps(),
  },
  (t) => [uniqueIndex("request_forms_slug_idx").on(t.publicSlug).where(sql`${t.publicSlug} is not null`)],
);

/** What was sent through a form, and the task it became. */
export const requestSubmissions = pgTable(
  "request_submissions",
  {
    id: id(),
    formId: uuid("form_id")
      .notNull()
      .references(() => requestForms.id),
    taskId: uuid("task_id").references(() => tasks.id),
    /** Null when sent through the public link. */
    submittedById: uuid("submitted_by_id").references(() => people.id),
    submitterName: text("submitter_name").notNull(),
    submitterEmail: text("submitter_email"),
    /** Public link only: a one-way hash of where the request came from, to limit one sender's requests. */
    submitterKey: text("submitter_key"),
    answers: jsonb("answers").$type<Record<string, string>>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("request_submissions_form_idx").on(t.formId, t.createdAt)],
);

/** An automation rule (Stage 9b.5): when `trigger` happens to a task matching `conditions`, run `actions`. */
export const automations = pgTable("automations", {
  id: id(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  trigger: jsonb("trigger").$type<Record<string, unknown>>().notNull(),
  conditions: jsonb("conditions").$type<Record<string, unknown>>().notNull(),
  actions: jsonb("actions").$type<Array<Record<string, unknown>>>().notNull(),
  runs: integer("runs").notNull().default(0),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdById: uuid("created_by_id").references(() => people.id),
  ...timestamps(),
});
