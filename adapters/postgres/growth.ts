import { and, asc, desc, eq, gte, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { departments, events, growthGoals, growthScores, learningItems, people, roleSkills, skillLevels, skills, tasks } from "@/db/schema";
import type { GrowthRepository, LevelRow } from "@/repositories";
import type { Db } from "./connection";

export function growthRepository(db: Db): GrowthRepository {
  const setter = alias(people, "level_setter");
  const assigner = alias(people, "learning_assigner");
  const skillRows = (where: SQL | undefined) =>
    db
      .select({ id: skills.id, name: skills.name, group: skills.group, description: skills.description, departmentId: skills.departmentId, departmentName: departments.name, position: skills.position })
      .from(skills)
      .leftJoin(departments, eq(departments.id, skills.departmentId))
      .where(and(isNull(skills.deletedAt), where))
      .orderBy(asc(skills.group), asc(skills.position), asc(skills.name));
  const goalRows = (where: SQL | undefined) =>
    db
      .select({
        id: growthGoals.id,
        personId: growthGoals.personId,
        skillId: growthGoals.skillId,
        skillName: skills.name,
        title: growthGoals.title,
        targetLevel: growthGoals.targetLevel,
        dueDate: growthGoals.dueDate,
        plan: growthGoals.plan,
        proof: growthGoals.proof,
        status: growthGoals.status,
        closedAt: growthGoals.closedAt,
        createdAt: growthGoals.createdAt,
      })
      .from(growthGoals)
      .leftJoin(skills, and(eq(skills.id, growthGoals.skillId), isNull(skills.deletedAt)))
      .where(and(isNull(growthGoals.deletedAt), where))
      .orderBy(asc(growthGoals.dueDate), desc(growthGoals.createdAt));
  const learningRows = (where: SQL | undefined) =>
    db
      .select({
        id: learningItems.id,
        personId: learningItems.personId,
        goalId: learningItems.goalId,
        kind: learningItems.kind,
        title: learningItems.title,
        url: learningItems.url,
        docId: learningItems.docId,
        taskId: learningItems.taskId,
        status: learningItems.status,
        minutes: learningItems.minutes,
        costPaise: learningItems.costPaise,
        assignedByName: assigner.fullName,
        createdAt: learningItems.createdAt,
      })
      .from(learningItems)
      .leftJoin(assigner, eq(assigner.id, learningItems.assignedById))
      .where(and(isNull(learningItems.deletedAt), where))
      .orderBy(desc(learningItems.createdAt));
  return {
    async lockPerson(personId) {
      await db.execute(sql`select pg_advisory_xact_lock(hashtext(${"growth:" + personId}))`);
    },
    skills: () => skillRows(undefined),
    async findSkill(id) {
      const [row] = await skillRows(eq(skills.id, id));
      return row ?? null;
    },
    async addSkill(row) {
      await db.insert(skills).values(row);
    },
    async updateSkill(id, patch) {
      await db.update(skills).set({ ...patch, updatedAt: new Date() }).where(eq(skills.id, id));
    },
    async roleSkills() {
      return db
        .select({ role: roleSkills.role, skillId: roleSkills.skillId, requiredLevel: roleSkills.requiredLevel })
        .from(roleSkills)
        .innerJoin(skills, and(eq(skills.id, roleSkills.skillId), isNull(skills.deletedAt)))
        .where(isNull(roleSkills.deletedAt));
    },
    async setRoleSkill(role, skillId, level, id, at) {
      const [current] = await db.select({ id: roleSkills.id, level: roleSkills.requiredLevel }).from(roleSkills).where(and(eq(roleSkills.role, role), eq(roleSkills.skillId, skillId), isNull(roleSkills.deletedAt))).limit(1);
      if (level === null) {
        if (!current) return false;
        await db.update(roleSkills).set({ deletedAt: at }).where(eq(roleSkills.id, current.id));
        return true;
      }
      if (current?.level === level) return false;
      if (current) await db.update(roleSkills).set({ requiredLevel: level, updatedAt: at }).where(eq(roleSkills.id, current.id));
      else await db.insert(roleSkills).values({ id, role, skillId, requiredLevel: level });
      return true;
    },
    async currentLevels(personIds) {
      if (personIds && !personIds.length) return [];
      const rows = await db.execute(sql`
        select distinct on (sl.person_id, sl.skill_id) sl.person_id, sl.skill_id, sl.level, sl.evidence, sp.full_name as set_by, sl.created_at
        from skill_levels sl
        join skills s on s.id = sl.skill_id and s.deleted_at is null
        left join people sp on sp.id = sl.set_by_id
        ${personIds ? sql`where sl.person_id in (${sql.join(personIds.map((p) => sql`${p}`), sql`, `)})` : sql``}
        order by sl.person_id, sl.skill_id, sl.created_at desc, sl.id desc`);
      return rows.map((r): LevelRow => ({ personId: String(r.person_id), skillId: String(r.skill_id), level: Number(r.level), evidence: (r.evidence as string | null) ?? null, setByName: (r.set_by as string | null) ?? null, createdAt: new Date(String(r.created_at)) }));
    },
    async levelHistory(personId) {
      return db
        .select({ personId: skillLevels.personId, skillId: skillLevels.skillId, level: skillLevels.level, evidence: skillLevels.evidence, setByName: setter.fullName, createdAt: skillLevels.createdAt })
        .from(skillLevels)
        .leftJoin(setter, eq(setter.id, skillLevels.setById))
        .where(eq(skillLevels.personId, personId))
        .orderBy(desc(skillLevels.createdAt))
        .limit(200);
    },
    async addLevel(row) {
      await db.insert(skillLevels).values(row);
    },
    goals: (f) => goalRows(and(f.personId ? eq(growthGoals.personId, f.personId) : undefined, f.status ? eq(growthGoals.status, f.status) : undefined)),
    async findGoal(id) {
      const [row] = await goalRows(eq(growthGoals.id, id));
      return row ?? null;
    },
    async addGoal(row) {
      await db.insert(growthGoals).values(row);
    },
    async updateGoal(id, patch) {
      await db.update(growthGoals).set({ ...patch, updatedAt: new Date() }).where(eq(growthGoals.id, id));
    },
    learning: (f) => learningRows(and(f.personId ? eq(learningItems.personId, f.personId) : undefined, f.goalId ? eq(learningItems.goalId, f.goalId) : undefined)),
    async findLearning(id) {
      const [row] = await learningRows(eq(learningItems.id, id));
      return row ?? null;
    },
    async addLearning(row) {
      await db.insert(learningItems).values(row);
    },
    async updateLearning(id, patch) {
      await db.update(learningItems).set({ ...patch, updatedAt: new Date() }).where(eq(learningItems.id, id));
    },
    async scores(personIds, fromMonth) {
      if (!personIds.length) return [];
      return db
        .select({ personId: growthScores.personId, month: growthScores.month, score: growthScores.score, parts: growthScores.parts })
        .from(growthScores)
        .where(and(inArray(growthScores.personId, [...personIds]), gte(growthScores.month, fromMonth)))
        .orderBy(asc(growthScores.month));
    },
    async saveScore(row) {
      await db.insert(growthScores).values(row).onConflictDoUpdate({ target: [growthScores.personId, growthScores.month], set: { score: row.score, parts: row.parts } });
    },
    async reopenedCount(personId, since) {
      const [r] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(events)
        .innerJoin(tasks, eq(tasks.id, events.entityId))
        .where(and(eq(events.action, "task.reopened"), eq(events.entityType, "task"), eq(tasks.ownerId, personId), gte(events.occurredAt, since)));
      return Number(r?.n ?? 0);
    },
  };
}
