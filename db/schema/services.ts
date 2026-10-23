import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { ROLES, type Role } from "@/lib/types";
import { id, oneOf, timestamps } from "./columns";

/** What Oppllo sells. Editable in Settings (decision D19). */
export const services = pgTable(
  "services",
  {
    id: id(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    active: boolean("active").notNull().default(true),
    position: integer("position").notNull().default(0),
    ...timestamps(),
  },
  (t) => [uniqueIndex("services_key_uq").on(t.key).where(sql`${t.deletedAt} is null`)],
);

/** Default project stages for a service. Projects copy them at creation (decision D20). */
export const serviceStages = pgTable(
  "service_stages",
  {
    id: id(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    ...timestamps(),
  },
  (t) => [index("service_stages_service_idx").on(t.serviceId, t.position)],
);

/** Starter tasks created when a project for this service starts. */
export const serviceTaskTemplates = pgTable(
  "service_task_templates",
  {
    id: id(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id),
    title: text("title").notNull(),
    /** Which stage (by position) the task belongs to, if any. */
    stagePosition: integer("stage_position"),
    /** Due this many days after the project starts. */
    dueOffsetDays: integer("due_offset_days").notNull().default(7),
    estimateMinutes: integer("estimate_minutes"),
    /** Suggested owner role; the person is chosen when the project starts. */
    defaultRole: text("default_role").$type<Role>(),
    position: integer("position").notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    index("service_task_templates_service_idx").on(t.serviceId, t.position),
    check("service_task_templates_role_ck", sql`${t.defaultRole} is null or ${oneOf(t.defaultRole, ROLES)}`),
  ],
);
