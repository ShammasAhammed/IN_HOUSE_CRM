import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { clientResults, people } from "@/db/schema";
import type { ResultsRepository } from "@/repositories";
import type { Db } from "./connection";

export function resultsRepository(db: Db): ResultsRepository {
  return {
    async selfLive(month) {
      const inMonth = (col: string) => sql.raw(`(${col} at time zone 'Asia/Kolkata')::date >= '${month}'::date and (${col} at time zone 'Asia/Kolkata')::date < ('${month}'::date + interval '1 month')`);
      if (!/^\d{4}-\d{2}-01$/.test(month)) throw new Error("A month's first day");
      const [counts] = await db.execute<{ leads: number; demos: number; won: number }>(sql`
        select
          (select count(*)::int from leads where deleted_at is null and ${inMonth("created_at")}) as leads,
          (select count(distinct a.lead_id)::int from lead_activities a join leads l on l.id = a.lead_id where l.deleted_at is null and a.to_stage = 'audit_booked' and ${inMonth("a.at")}) as demos,
          (select count(*)::int from leads where deleted_at is null and won_at is not null and ${inMonth("won_at")}) as won`);
      const byChannel = await db.execute<{ channel: string; leads: number }>(sql`
        select coalesce(nullif(channel, ''), 'Landing page') as channel, count(*)::int as leads from leads
        where deleted_at is null and ${inMonth("created_at")} group by 1 order by 2 desc, 1`);
      return { leads: counts?.leads ?? 0, demos: counts?.demos ?? 0, won: counts?.won ?? 0, byChannel: byChannel.map((r) => ({ channel: r.channel, leads: Number(r.leads) })) };
    },
    async list({ clientIds, from, to }) {
      if (clientIds && clientIds.length === 0) return [];
      const rows = await db
        .select({ row: clientResults, updatedByName: people.fullName })
        .from(clientResults)
        .leftJoin(people, eq(people.id, clientResults.updatedById))
        .where(and(gte(clientResults.month, from), lte(clientResults.month, to), clientIds ? inArray(clientResults.clientId, [...clientIds]) : undefined))
        .orderBy(asc(clientResults.month));
      return rows.map(({ row: { createdAt: _c, updatedById: _u, ...r }, updatedByName }) => ({ ...r, updatedByName }));
    },
    async save(id, row, at) {
      const [r] = await db
        .insert(clientResults)
        .values({ id, ...row, createdAt: at, updatedAt: at })
        .onConflictDoUpdate({
          target: [clientResults.clientId, clientResults.month],
          set: {
            engagementId: sql`excluded.engagement_id`,
            leads: sql`excluded.leads`,
            spendPaise: sql`excluded.spend_paise`,
            callsBooked: sql`excluded.calls_booked`,
            admissions: sql`excluded.admissions`,
            targetLeads: sql`excluded.target_leads`,
            targetAdmissions: sql`excluded.target_admissions`,
            leadsSource: sql`excluded.leads_source`,
            spendSource: sql`excluded.spend_source`,
            updatedById: sql`excluded.updated_by_id`,
            updatedAt: at,
          },
        })
        .returning({ id: clientResults.id });
      return r.id;
    },
  };
}
