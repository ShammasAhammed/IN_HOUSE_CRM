// Working together on a task (Stage 9b.2): more people on it, a checklist inside it, files and links on it.
import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { STORAGE_PROVIDERS, TASK_PERSON_ROLES, type StorageProvider, type TaskPersonRole } from "@/lib/types";
import { createdAt, id, oneOf } from "./columns";
import { people } from "./people";
import { tasks } from "./projects";

/** People on a task besides its owner: more assignees (they do it with the owner) and watchers (kept informed). */
export const taskPeople = pgTable(
  "task_people",
  {
    id: id(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    role: text("role").$type<TaskPersonRole>().notNull(),
    addedById: uuid("added_by_id").references(() => people.id),
    createdAt: createdAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("task_people_one_idx").on(t.taskId, t.personId, t.role).where(sql`${t.deletedAt} is null`),
    index("task_people_person_idx").on(t.personId).where(sql`${t.deletedAt} is null`),
    check("task_people_role_ck", oneOf(t.role, TASK_PERSON_ROLES)),
  ],
);

/** A to-do list inside a task: small steps that don't need to be tasks of their own. */
export const taskChecklistItems = pgTable(
  "task_checklist_items",
  {
    id: id(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id),
    text: text("text").notNull(),
    done: boolean("done").notNull().default(false),
    doneById: uuid("done_by_id").references(() => people.id),
    doneAt: timestamp("done_at", { withTimezone: true }),
    rank: text("rank").notNull(),
    createdById: uuid("created_by_id").references(() => people.id),
    createdAt: createdAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("task_checklist_items_task_idx").on(t.taskId).where(sql`${t.deletedAt} is null`)],
);

/** A file on a task (a pointer to storage, never the bytes) or a link to one kept elsewhere (Drive, Figma, Canva). */
export const taskFiles = pgTable(
  "task_files",
  {
    id: id(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id),
    title: text("title").notNull(),
    provider: text("provider").$type<StorageProvider>().notNull(),
    location: text("location").notNull(),
    fileId: text("file_id").notNull(),
    fileName: text("file_name"),
    contentType: text("content_type"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    addedById: uuid("added_by_id").references(() => people.id),
    createdAt: createdAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("task_files_task_idx").on(t.taskId).where(sql`${t.deletedAt} is null`), check("task_files_provider_ck", oneOf(t.provider, STORAGE_PROVIDERS))],
);

/** "This task waits on that one" (Stage 9b.3): the blocker must be done before the waiting task can really start. */
export const taskDependencies = pgTable(
  "task_dependencies",
  {
    id: id(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id),
    dependsOnId: uuid("depends_on_id")
      .notNull()
      .references(() => tasks.id),
    createdById: uuid("created_by_id").references(() => people.id),
    createdAt: createdAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("task_dependencies_one_idx").on(t.taskId, t.dependsOnId).where(sql`${t.deletedAt} is null`),
    index("task_dependencies_blocker_idx").on(t.dependsOnId).where(sql`${t.deletedAt} is null`),
    check("task_dependencies_self_ck", sql`${t.taskId} <> ${t.dependsOnId}`),
  ],
);
