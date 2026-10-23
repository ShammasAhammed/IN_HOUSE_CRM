import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { clients, goalCheckins, goalProjects, goals, people, projects } from "@/db/schema";
import type { GoalCheckin, GoalRecord, GoalsRepository } from "@/repositories";
import type { Db } from "./connection";

const owner = alias(people, "goal_owner");

export function goalsRepository(db: Db): GoalsRepository {
  async function rows(where: ReturnType<typeof eq> | undefined): Promise<GoalRecord[]> {
    const list = await db
      .select({
        id: goals.id,
        parentId: goals.parentId,
        title: goals.title,
        description: goals.description,
        unit: goals.unit,
        target: goals.target,
        period: goals.period,
        startsOn: goals.startsOn,
        endsOn: goals.endsOn,
        source: goals.source,
        ownerId: goals.ownerId,
        ownerName: owner.fullName,
        spaceId: goals.spaceId,
        spaceName: clients.name,
        leadersOnly: goals.leadersOnly,
        createdById: goals.createdById,
        createdAt: goals.createdAt,
        updatedAt: goals.updatedAt,
      })
      .from(goals)
      .leftJoin(owner, eq(owner.id, goals.ownerId))
      .leftJoin(clients, eq(clients.id, goals.spaceId))
      .where(and(isNull(goals.archivedAt), where))
      .orderBy(sql`${goals.parentId} nulls first`, goals.startsOn, goals.title);
    if (!list.length) return [];
    // The latest check-in, and the latest one with a number, per goal (one query for all).
    const last = await db.execute<{ id: string; goal_id: string; value: string | null; note: string; person_id: string; person_name: string; created_at: Date; last_value: string | null }>(sql`
      select distinct on (c.goal_id) c.id, c.goal_id, c.value, c.note, c.person_id, p.full_name as person_name, c.created_at,
        (select v.value from goal_checkins v where v.goal_id = c.goal_id and v.value is not null order by v.created_at desc limit 1) as last_value
      from goal_checkins c join people p on p.id = c.person_id
      where c.goal_id in (${sql.join(list.map((g) => sql`${g.id}`), sql`, `)})
      order by c.goal_id, c.created_at desc`);
    const byGoal = new Map(last.map((r) => [r.goal_id, r]));
    return list.map((g) => {
      const r = byGoal.get(g.id);
      return {
        ...(g as Omit<GoalRecord, "lastCheckin" | "lastValue">),
        lastCheckin: r ? { id: r.id, goalId: r.goal_id, value: r.value === null ? null : Number(r.value), note: r.note, personId: r.person_id, personName: r.person_name, createdAt: new Date(r.created_at) } : null,
        lastValue: r?.last_value == null ? null : Number(r.last_value),
      };
    });
  }

  return {
    async create({ at, ...row }) {
      await db.insert(goals).values({ ...row, createdAt: at, updatedAt: at });
    },
    async find(id) {
      return (await rows(eq(goals.id, id)))[0] ?? null;
    },
    list: () => rows(undefined),
    async update(id, { at, ...patch }) {
      await db.update(goals).set({ ...patch, updatedAt: at }).where(eq(goals.id, id));
    },
    async archive(id, at) {
      await db.update(goals).set({ archivedAt: at, updatedAt: at }).where(eq(goals.id, id));
    },
    async addCheckin({ at, ...row }) {
      await db.insert(goalCheckins).values({ ...row, createdAt: at });
    },
    async checkins(goalId, limit = 50) {
      return db
        .select({ id: goalCheckins.id, goalId: goalCheckins.goalId, value: goalCheckins.value, note: goalCheckins.note, personId: goalCheckins.personId, personName: people.fullName, createdAt: goalCheckins.createdAt })
        .from(goalCheckins)
        .innerJoin(people, eq(people.id, goalCheckins.personId))
        .where(eq(goalCheckins.goalId, goalId))
        .orderBy(desc(goalCheckins.createdAt))
        .limit(limit) as Promise<GoalCheckin[]>;
    },
    async setProjects(goalId, projectIds) {
      await db.delete(goalProjects).where(eq(goalProjects.goalId, goalId));
      if (projectIds.length) await db.insert(goalProjects).values(projectIds.map((projectId) => ({ goalId, projectId })));
    },
    async projects(goalIds) {
      if (!goalIds.length) return [];
      const r = await db
        .select({
          goalId: goalProjects.goalId,
          projectId: projects.id,
          name: projects.name,
          clientId: projects.clientId,
          done: sql<number>`(select count(*) from tasks t where t.project_id = ${projects.id} and t.deleted_at is null and t.parent_task_id is null and t.status = 'done')::int`,
          total: sql<number>`(select count(*) from tasks t where t.project_id = ${projects.id} and t.deleted_at is null and t.parent_task_id is null)::int`,
        })
        .from(goalProjects)
        .innerJoin(projects, eq(projects.id, goalProjects.projectId))
        .where(and(inArray(goalProjects.goalId, [...goalIds]), isNull(projects.deletedAt)));
      return r;
    },
    async liveValue(source, from, to) {
      const one = async (q: ReturnType<typeof sql>) => {
        const [r] = await db.execute<{ v: string | null }>(q);
        return r?.v == null ? null : Number(r.v);
      };
      const day = (col: string) => sql.raw(`(${col} at time zone 'Asia/Kolkata')::date`);
      switch (source) {
        case "revenue":
          return (await one(sql`select coalesce(sum(i.amount_paise), 0) as v from invoices i join clients c on c.id = i.client_id where not c.is_internal and i.invoice_date between ${from} and ${to}`)) ?? 0;
        case "won_leads":
          return (await one(sql`select count(*) as v from leads where deleted_at is null and won_at is not null and ${day("won_at")} between ${from} and ${to}`)) ?? 0;
        case "new_leads":
          return (await one(sql`select count(*) as v from leads where deleted_at is null and ${day("created_at")} between ${from} and ${to}`)) ?? 0;
        case "client_leads":
        case "client_admissions": {
          const col = sql.raw(source === "client_leads" ? "r.leads" : "r.admissions");
          // Blank isn't zero: null when no client entered this number for any month of the period.
          return one(sql`select sum(${col}) as v from client_results r join clients c on c.id = r.client_id where not c.is_internal and c.deleted_at is null and r.month between date_trunc('month', ${from}::date)::date and ${to}`);
        }
        case "active_clients":
          return (await one(sql`select count(*) as v from clients where deleted_at is null and not is_internal and status = 'active'`)) ?? 0;
        case "hires":
          return (await one(sql`select count(*) as v from people where join_date between ${from} and ${to}`)) ?? 0;
      }
    },
    async staleOwned(personId, before) {
      const [r] = await db.execute<{ n: number }>(sql`
        select count(*)::int as n from goals g
        where g.archived_at is null and g.owner_id = ${personId} and coalesce((select max(c.created_at) from goal_checkins c where c.goal_id = g.id), g.created_at) < ${before.toISOString()}`);
      return r?.n ?? 0;
    },
  };
}
