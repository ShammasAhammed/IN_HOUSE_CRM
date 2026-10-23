import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { coworkerDigests, coworkerSuggestions } from "@/db/schema";
import type { BoardSetup, CoworkerRepository, SuggestionRecord } from "@/repositories";
import type { Db } from "./connection";

const date = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : (v as string | null));

export function coworkerRepository(db: Db): CoworkerRepository {
  return {
    async clients() {
      const rows = await db.execute<{ id: string; name: string; is_private: boolean; is_internal: boolean; lead_strategist_id: string | null; last: Date | null }>(sql`
        select c.id, c.name, c.is_private, c.is_internal, c.lead_strategist_id, a.last
        from clients c
        left join (select client_id, max(occurred_at) as last from events where client_id is not null group by client_id) a on a.client_id = c.id
        where c.deleted_at is null and c.status in ('onboarding', 'active')`);
      return rows.map((r) => ({ id: r.id, name: r.name, isPrivate: r.is_private, isInternal: r.is_internal, leadStrategistId: r.lead_strategist_id, lastActivityAt: r.last ? new Date(r.last) : null }));
    },
    async openTasks() {
      const rows = await db.execute<{ id: string; title: string; client_id: string; project_id: string; owner_id: string | null; owner_name: string | null; status: string; due_date: string | null; blocked_since: Date | null }>(sql`
        select t.id, t.title, t.client_id, t.project_id, t.owner_id, p.full_name as owner_name, t.status, t.due_date,
          case when t.status = 'blocked' then coalesce(
            (select max(e.occurred_at) from events e where e.entity_type = 'task' and e.entity_id = t.id and e.data->>'to' = 'blocked'),
            t.updated_at) end as blocked_since
        from tasks t
        join projects pr on pr.id = t.project_id and pr.deleted_at is null and pr.status in ('planned', 'active')
        left join people p on p.id = t.owner_id
        where t.deleted_at is null and t.status <> 'done' and t.parent_task_id is null`);
      return rows.map((r) => ({ id: r.id, title: r.title, clientId: r.client_id, projectId: r.project_id, ownerId: r.owner_id, ownerName: r.owner_name, status: r.status, dueDate: date(r.due_date), blockedSince: r.blocked_since ? new Date(r.blocked_since) : null }));
    },
    async inClientReview() {
      const rows = await db.execute<{ id: string; title: string; client_id: string; since: Date }>(sql`select id, title, client_id, updated_at as since from assets where approval_state = 'client_review' and deleted_at is null`);
      return rows.map((r) => ({ id: r.id, title: r.title, clientId: r.client_id, since: new Date(r.since) }));
    },
    async postsBetween(from, to) {
      const rows = await db.execute<{ client_id: string; n: number }>(sql`select client_id, count(*)::int as n from content_items where deleted_at is null and publish_on between ${from} and ${to} group by client_id`);
      return new Map(rows.map((r) => [r.client_id, Number(r.n)]));
    },
    async setup(month) {
      const rows = await db.execute<{ id: string; has_target: boolean; has_knowledge: boolean; has_ad_account: boolean; project_id: string | null }>(sql`
        select c.id,
          exists (select 1 from client_results r where r.client_id = c.id and r.month = ${month} and (r.target_leads is not null or r.target_admissions is not null)) as has_target,
          exists (select 1 from client_knowledge k where k.client_id = c.id and (k.tone <> '' or k.dos <> '' or k.donts <> ''))
            or exists (select 1 from client_campaigns cc where cc.client_id = c.id and cc.deleted_at is null) as has_knowledge,
          exists (select 1 from client_ad_accounts a where a.client_id = c.id and a.deleted_at is null) as has_ad_account,
          (select pr.id from projects pr where pr.client_id = c.id and pr.deleted_at is null and pr.status = 'active' order by pr.created_at desc limit 1) as project_id
        from clients c where c.deleted_at is null and c.status in ('onboarding', 'active')`);
      return rows.map((r): BoardSetup => ({ clientId: r.id, hasTarget: r.has_target, hasKnowledge: r.has_knowledge, hasAdAccount: r.has_ad_account, activeProjectId: r.project_id }));
    },
    async clientComments(since) {
      const rows = await db.execute<{ client_id: string; body: string; at: Date }>(sql`
        select a.client_id, c.body, c.created_at as at from asset_comments c join assets a on a.id = c.asset_id
        where c.portal_user_id is not null and c.deleted_at is null and c.created_at >= ${since.toISOString()} order by c.created_at desc`);
      return rows.map((r) => ({ clientId: r.client_id, body: r.body, at: new Date(r.at) }));
    },

    async add(row, at) {
      await db.insert(coworkerSuggestions).values({ ...row, status: "open", createdAt: at });
    },
    async find(id) {
      const [r] = await db.select().from(coworkerSuggestions).where(eq(coworkerSuggestions.id, id));
      return (r as SuggestionRecord | undefined) ?? null;
    },
    forChannel(channelId) {
      return db.select().from(coworkerSuggestions).where(eq(coworkerSuggestions.channelId, channelId)).orderBy(desc(coworkerSuggestions.createdAt)).limit(100) as Promise<SuggestionRecord[]>;
    },
    async update(id, from, patch) {
      const r = await db
        .update(coworkerSuggestions)
        .set(patch)
        .where(and(eq(coworkerSuggestions.id, id), inArray(coworkerSuggestions.status, [...from])))
        .returning({ id: coworkerSuggestions.id });
      return r.length > 0;
    },
    async blockedKeys(since) {
      const rows = await db.execute<{ k: string }>(sql`
        select distinct unnest(keys) as k from coworker_suggestions
        where status in ('open', 'snoozed') or (status = 'dismissed' and decided_at >= ${since.toISOString()})`);
      return new Set(rows.map((r) => r.k));
    },
    async postedOn(channelId, day) {
      const [r] = await db.execute<{ n: number }>(sql`select count(*)::int as n from coworker_suggestions where channel_id = ${channelId} and day = ${day}`);
      return Number(r?.n ?? 0);
    },
    async answers(clientId, kind, limit) {
      const rows = await db.execute<{ status: string }>(sql`
        select status from coworker_suggestions where client_id = ${clientId} and kind = ${kind} and status in ('approved', 'partly', 'dismissed')
        order by decided_at desc limit ${limit}`);
      return rows.map((r) => (r.status === "dismissed" ? "dismissed" : "approved"));
    },
    async rates() {
      const rows = await db.execute<{ kind: string; approved: number; dismissed: number }>(sql`
        select kind, count(*) filter (where status in ('approved', 'partly'))::int as approved, count(*) filter (where status = 'dismissed')::int as dismissed
        from coworker_suggestions group by kind order by kind`);
      return rows.map((r) => ({ kind: r.kind, approved: Number(r.approved), dismissed: Number(r.dismissed) }));
    },
    async dueSnoozes(today) {
      return (await db.execute(sql`
        select s.* from coworker_suggestions s where s.status = 'snoozed' and (s.snoozed_until <= ${today} or (s.wake_on_client_reply and exists (
          select 1 from asset_comments c join assets a on a.id = c.asset_id
          where a.client_id = s.client_id and c.portal_user_id is not null and c.created_at > s.snoozed_at)))`)).map(
        (r: Record<string, unknown>): SuggestionRecord => ({
          id: r.id as string,
          clientId: r.client_id as string,
          channelId: r.channel_id as string,
          kind: r.kind as string,
          keys: r.keys as string[],
          title: r.title as string,
          why: r.why as string[],
          actions: r.actions as SuggestionRecord["actions"],
          wording: (r.wording as string | null) ?? null,
          status: r.status as SuggestionRecord["status"],
          results: (r.results as SuggestionRecord["results"]) ?? null,
          snoozedUntil: date(r.snoozed_until),
          wakeOnClientReply: Boolean(r.wake_on_client_reply),
          snoozedAt: r.snoozed_at ? new Date(r.snoozed_at as string) : null,
          decidedById: (r.decided_by_id as string | null) ?? null,
          decidedAt: r.decided_at ? new Date(r.decided_at as string) : null,
          day: date(r.day)!,
          createdAt: new Date(r.created_at as string),
        }),
      );
    },
    async clientWaiting() {
      const rows = await db.execute<{ client_id: string; since: Date }>(sql`
        select c.client_id, w.since from chat_channels c
        join lateral (
          select min(m.created_at) as since from chat_messages m
          where m.channel_id = c.id and m.portal_user_id is not null and m.deleted_at is null
            and m.created_at > coalesce((select max(s.created_at) from chat_messages s where s.channel_id = c.id and s.author_id is not null and s.deleted_at is null), 'epoch')
        ) w on w.since is not null
        where c.kind = 'shared' and c.archived_at is null`);
      return rows.map((r) => ({ clientId: r.client_id, since: new Date(r.since) }));
    },
    async saveDigest(day, lines) {
      await db.insert(coworkerDigests).values({ day, lines }).onConflictDoUpdate({ target: coworkerDigests.day, set: { lines } });
    },
    async digest(day) {
      const [r] = await db.select({ lines: coworkerDigests.lines }).from(coworkerDigests).where(eq(coworkerDigests.day, day));
      return r?.lines ?? null;
    },
  };
}
