import { and, desc, eq, gte, inArray, isNull, lt, notInArray, sql } from "drizzle-orm";
import { aiUsage, leadAiScores, leads, people } from "@/db/schema";
import { newId } from "@/lib/id";
import type { AiUsageRecord, AiUsageRepository, LeadAiScoreRepository } from "@/repositories";
import type { Db } from "./connection";

const inRange = (from: Date, to: Date) => and(gte(aiUsage.createdAt, from), lt(aiUsage.createdAt, to));
const totals = { questions: sql<number>`count(*)::int`, costPaise: sql<number>`coalesce(sum(${aiUsage.costPaise}), 0)::bigint` };

export function aiUsageRepository(db: Db): AiUsageRepository {
  return {
    async lock() {
      await db.execute(sql`select pg_advisory_xact_lock(hashtext('ai_usage'))`);
    },
    async record({ at, ...row }) {
      const id = newId();
      await db.insert(aiUsage).values({ id, ...row, createdAt: at });
      return id;
    },
    async finish(id, row) {
      await db.update(aiUsage).set(row).where(eq(aiUsage.id, id));
    },
    async totals({ from, to, personId, feature, exceptFeatures }) {
      const [row] = await db
        .select(totals)
        .from(aiUsage)
        .where(and(inRange(from, to), personId ? eq(aiUsage.personId, personId) : undefined, feature ? eq(aiUsage.feature, feature) : undefined, exceptFeatures?.length ? notInArray(aiUsage.feature, [...exceptFeatures]) : undefined));
      return { questions: Number(row?.questions ?? 0), costPaise: Number(row?.costPaise ?? 0) };
    },
    async byPerson({ from, to }) {
      const rows = await db
        .select({ personId: aiUsage.personId, personName: people.fullName, ...totals })
        .from(aiUsage)
        .innerJoin(people, eq(people.id, aiUsage.personId))
        .where(inRange(from, to))
        .groupBy(aiUsage.personId, people.fullName)
        .orderBy(desc(sql`sum(${aiUsage.costPaise})`));
      return rows.map((r) => ({ ...r, questions: Number(r.questions), costPaise: Number(r.costPaise) }));
    },
    async recent({ from, to }, limit) {
      const { id, personId, feature, provider, model, outcome, calls, inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens, costMicroUsd, costPaise, escalatedFrom, createdAt } = aiUsage;
      const rows = await db
        .select({ id, personId, personName: people.fullName, feature, provider, model, outcome, calls, inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens, costMicroUsd, costPaise, escalatedFrom, createdAt })
        .from(aiUsage)
        .innerJoin(people, eq(people.id, aiUsage.personId))
        .where(inRange(from, to))
        .orderBy(desc(aiUsage.createdAt))
        .limit(limit);
      return rows as AiUsageRecord[];
    },
  };
}

export function leadAiScoreRepository(db: Db): LeadAiScoreRepository {
  return {
    async forLeads(leadIds) {
      if (!leadIds.length) return [];
      return db.select().from(leadAiScores).where(inArray(leadAiScores.leadId, [...leadIds]));
    },
    async save(row) {
      await db.insert(leadAiScores).values(row).onConflictDoUpdate({ target: leadAiScores.leadId, set: row });
    },
    async unscored(since, limit) {
      const rows = await db
        .select({ id: leads.id })
        .from(leads)
        .leftJoin(leadAiScores, eq(leadAiScores.leadId, leads.id))
        .where(and(gte(leads.createdAt, since), isNull(leads.deletedAt), isNull(leadAiScores.leadId)))
        .orderBy(desc(leads.createdAt))
        .limit(limit);
      return rows.map((r) => r.id);
    },
  };
}
