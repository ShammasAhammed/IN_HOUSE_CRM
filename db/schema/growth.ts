// Skills and growth (plan/5): the skill matrix, each person's levels (every change kept), growth goals, assigned
// learning, and a monthly snapshot of each person's score for the trend.
import { sql } from "drizzle-orm";
import { check, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { GOAL_STATUSES, LEARNING_KINDS, LEARNING_STATUSES, ROLES, SKILL_GROUPS, type GoalStatus, type LearningKind, type LearningStatus, type Role, type SkillGroup } from "@/lib/types";
import { createdAt, id, oneOf, paise, timestamps } from "./columns";
import { docs } from "./docs";
import { departments, people } from "./people";
import { tasks } from "./projects";

/** A skill: craft, client or leadership; a department's own, or everyone's. */
export const skills = pgTable(
  "skills",
  {
    id: id(),
    name: text("name").notNull(),
    group: text("group").$type<SkillGroup>().notNull(),
    description: text("description"),
    departmentId: uuid("department_id").references(() => departments.id),
    position: integer("position").notNull().default(0),
    ...timestamps(),
  },
  (t) => [check("skills_group_ck", oneOf(t.group, SKILL_GROUPS))],
);

/** What a position (a role) needs: the level each skill must reach. */
export const roleSkills = pgTable(
  "role_skills",
  {
    id: id(),
    role: text("role").$type<Role>().notNull(),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id),
    requiredLevel: integer("required_level").notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("role_skills_one_idx").on(t.role, t.skillId).where(sql`${t.deletedAt} is null`),
    check("role_skills_role_ck", oneOf(t.role, ROLES)),
    check("role_skills_level_ck", sql`${t.requiredLevel} between 1 and 5`),
  ],
);

/** A person's level in a skill, as set over time. The latest row is the current level; older rows are the history. */
export const skillLevels = pgTable(
  "skill_levels",
  {
    id: id(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id),
    level: integer("level").notNull(),
    /** What showed it: a piece of work, a test campaign, a session taught. Required to move up (plan/5). */
    evidence: text("evidence"),
    setById: uuid("set_by_id").references(() => people.id),
    createdAt: createdAt(),
  },
  (t) => [index("skill_levels_person_idx").on(t.personId, t.skillId, t.createdAt), check("skill_levels_level_ck", sql`${t.level} between 0 and 5`)],
);

/** A growth goal: two or three live at a time, each with a target, a deadline, a plan and how it will be shown. */
export const growthGoals = pgTable(
  "growth_goals",
  {
    id: id(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    skillId: uuid("skill_id").references(() => skills.id),
    title: text("title").notNull(),
    targetLevel: integer("target_level"),
    dueDate: date("due_date"),
    plan: text("plan"),
    /** How it will be shown: the work that proves it. */
    proof: text("proof"),
    status: text("status").$type<GoalStatus>().notNull().default("active"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdById: uuid("created_by_id").references(() => people.id),
    ...timestamps(),
  },
  (t) => [index("growth_goals_person_idx").on(t.personId).where(sql`${t.deletedAt} is null`), check("growth_goals_status_ck", oneOf(t.status, GOAL_STATUSES))],
);

/** Learning assigned for a goal (or on its own): a course, an SOP, a practice task, shadowing, a stretch task. */
export const learningItems = pgTable(
  "learning_items",
  {
    id: id(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    goalId: uuid("goal_id").references(() => growthGoals.id),
    kind: text("kind").$type<LearningKind>().notNull(),
    title: text("title").notNull(),
    url: text("url"),
    docId: uuid("doc_id").references(() => docs.id),
    taskId: uuid("task_id").references(() => tasks.id),
    status: text("status").$type<LearningStatus>().notNull().default("assigned"),
    /** The company's side (plan/5): learning time given inside work hours, and money spent. */
    minutes: integer("minutes"),
    costPaise: paise("cost_paise"),
    assignedById: uuid("assigned_by_id").references(() => people.id),
    ...timestamps(),
  },
  (t) => [
    index("learning_items_person_idx").on(t.personId).where(sql`${t.deletedAt} is null`),
    check("learning_items_kind_ck", oneOf(t.kind, LEARNING_KINDS)),
    check("learning_items_status_ck", oneOf(t.status, LEARNING_STATUSES)),
  ],
);

/** The month's score per person, kept so the trend shows direction (plan/5: "trend beats level"). */
export const growthScores = pgTable(
  "growth_scores",
  {
    id: id(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    month: date("month").notNull(),
    score: integer("score").notNull(),
    parts: jsonb("parts").$type<Record<string, number | null>>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("growth_scores_month_idx").on(t.personId, t.month)],
);
