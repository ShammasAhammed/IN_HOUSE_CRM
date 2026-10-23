// Company and team goals (Stage 14.3): company goals set by the owner, team goals under them owned by a space or a
// person, check-ins with the number and a note, and the projects that support a team goal.
import { sql } from "drizzle-orm";
import { bigint, boolean, check, date, index, pgTable, primaryKey, text, timestamp, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { GOAL_PERIODS, GOAL_SOURCES, GOAL_UNITS, type GoalPeriod, type GoalSource, type GoalUnit } from "@/lib/types";
import { clients } from "./clients";
import { createdAt, id, oneOf, updatedAt } from "./columns";
import { people } from "./people";
import { projects } from "./projects";

export const goals = pgTable(
  "goals",
  {
    id: id(),
    /** A team goal's company goal; null for a company goal. */
    parentId: uuid("parent_id").references((): AnyPgColumn => goals.id),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    unit: text("unit").$type<GoalUnit>().notNull(),
    /** Paise for money, a count, or whole percent. */
    target: bigint("target", { mode: "number" }).notNull(),
    period: text("period").$type<GoalPeriod>().notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    source: text("source").$type<GoalSource>().notNull().default("manual"),
    ownerId: uuid("owner_id").references(() => people.id),
    /** A team goal owned by a space (14.1): seen like the space (private ones only by members and the owner). */
    spaceId: uuid("space_id").references(() => clients.id),
    /** Company goals for the owner and strategists only. */
    leadersOnly: boolean("leaders_only").notNull().default(false),
    createdById: uuid("created_by_id").references(() => people.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("goals_parent_idx").on(t.parentId),
    check("goals_unit_ck", oneOf(t.unit, GOAL_UNITS)),
    check("goals_period_ck", oneOf(t.period, GOAL_PERIODS)),
    check("goals_source_ck", oneOf(t.source, GOAL_SOURCES)),
    check("goals_target_ck", sql`${t.target} >= 0 and ${t.endsOn} >= ${t.startsOn}`),
  ],
);

/** A check-in: the number then (null on live goals that only add a note) and a short note. Never edited. */
export const goalCheckins = pgTable(
  "goal_checkins",
  {
    id: id(),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goals.id),
    value: bigint("value", { mode: "number" }),
    note: text("note").notNull().default(""),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    createdAt: createdAt(),
  },
  (t) => [index("goal_checkins_goal_idx").on(t.goalId, t.createdAt)],
);

/** Projects (and through them tasks) that support a team goal. */
export const goalProjects = pgTable(
  "goal_projects",
  {
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goals.id),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
  },
  (t) => [primaryKey({ columns: [t.goalId, t.projectId] })],
);
