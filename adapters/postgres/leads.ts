import { and, arrayOverlaps, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, max, notInArray, or, sql } from "drizzle-orm";
import { clients, googleConversions, leadActivities, leadSources, leadViews, leads, people } from "@/db/schema";
import { newId } from "@/lib/id";
import type { LeadActivityRecord, LeadDetailRecord, LeadRow, LeadSourceRecord, LeadsRepository } from "@/repositories";
import type { Db } from "./connection";

/** Columns a later copy may overwrite (database names; Drizzle's `set` takes the camelCase field names, mapped below). */
const COPIED = [
  "external_id", "source_key", "name", "phone", "email", "institution", "contact_role", "district", "segment", "problem", "timeline", "seats", "admissions",
  "fee_paise", "spend_paise", "commission_paise", "cost_per_admission_paise", "stage", "score", "lost_reason", "origin", "channel",
  "landing", "campaign", "utm_source", "utm_medium", "utm_content", "utm_term", "owner_id", "owner_name", "next_follow_up_at",
  "stage_changed_at", "won_at", "last_note_at", "answers", "details", "updated_at", "copied_at",
] as const;

const row = {
  id: leads.id,
  name: leads.name,
  institution: leads.institution,
  phone: leads.phone,
  district: leads.district,
  segment: leads.segment,
  stage: leads.stage,
  tags: leads.tags,
  score: leads.score,
  lostReason: leads.lostReason,
  channel: leads.channel,
  origin: leads.origin,
  landing: leads.landing,
  campaign: leads.campaign,
  ownerId: leads.ownerId,
  ownerName: sql<string | null>`coalesce(${people.fullName}, ${leads.ownerName})`,
  nextFollowUpAt: leads.nextFollowUpAt,
  stageChangedAt: leads.stageChangedAt,
  clientId: leads.clientId,
  createdAt: leads.createdAt,
  updatedAt: leads.updatedAt,
};

/** LIKE patterns match literally: % and _ typed by a person are not wildcards. */
const contains = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export function leadsRepository(db: Db): LeadsRepository {
  return {
    async lockAutoAssign() {
      await db.execute(sql`select pg_advisory_xact_lock(7200001)`);
    },
    async list(f) {
      const q = f.search?.trim();
      const rows = await db
        .select(row)
        .from(leads)
        .leftJoin(people, eq(people.id, leads.ownerId))
        .where(
          and(
            isNull(leads.deletedAt),
            f.stages ? inArray(leads.stage, [...f.stages]) : undefined,
            // "Unassigned" means nobody at all, as on Today and the Sales dashboard (QA S6-B1).
            f.ownerId === "none"
              ? and(isNull(leads.ownerId), sql`coalesce(${leads.ownerName}, '') = ''`)
              : f.ownerId === "nologin"
                ? and(isNull(leads.ownerId), sql`coalesce(${leads.ownerName}, '') <> ''`)
                : f.ownerId
                  ? eq(leads.ownerId, f.ownerId)
                  : undefined,
            q ? or(ilike(leads.name, contains(q)), ilike(leads.institution, contains(q)), ilike(leads.phone, contains(q)), ilike(leads.email, contains(q))) : undefined,
            f.tags?.length ? arrayOverlaps(leads.tags, [...f.tags]) : undefined,
            f.channel ? eq(leads.channel, f.channel) : undefined,
            f.districts?.length ? inArray(leads.district, [...f.districts]) : undefined,
            f.crmOwnerName ? and(isNull(leads.ownerId), eq(leads.ownerName, f.crmOwnerName)) : undefined,
            f.segment ? eq(leads.segment, f.segment) : undefined,
            f.score ? eq(leads.score, f.score) : undefined,
            f.followUp === "none" ? isNull(leads.nextFollowUpAt) : undefined,
            f.followUp && f.followUp !== "none" && f.followUp.from ? gte(leads.nextFollowUpAt, f.followUp.from) : undefined,
            f.followUp && f.followUp !== "none" && f.followUp.before ? lt(leads.nextFollowUpAt, f.followUp.before) : undefined,
          ),
        )
        .orderBy(desc(leads.createdAt))
        .limit(f.limit);
      return rows as LeadRow[];
    },
    async views(personId) {
      return db.select({ id: leadViews.id, name: leadViews.name, query: leadViews.query }).from(leadViews).where(and(eq(leadViews.personId, personId), isNull(leadViews.deletedAt))).orderBy(asc(leadViews.createdAt));
    },
    async addView(row) {
      await db.insert(leadViews).values(row);
    },
    async removeView(id, personId, at) {
      const r = await db.update(leadViews).set({ deletedAt: at }).where(and(eq(leadViews.id, id), eq(leadViews.personId, personId), isNull(leadViews.deletedAt))).returning({ id: leadViews.id });
      return r.length > 0;
    },
    async findByContacts(phones, emails) {
      if (!phones.length && !emails.length) return [];
      const last10 = sql`right(regexp_replace(coalesce(${leads.phone}, ''), '[^0-9]', '', 'g'), 10)`;
      return db
        .select({ id: leads.id, name: leads.name, institution: leads.institution, phone: leads.phone, email: leads.email })
        .from(leads)
        .where(and(isNull(leads.deletedAt), or(phones.length ? inArray(last10, [...phones]) : undefined, emails.length ? inArray(sql`lower(${leads.email})`, [...emails]) : undefined)))
        .limit(5000);
    },
    async allTags() {
      const rows = await db.execute(sql`select tag, count(*)::int as n from leads, unnest(tags) as tag where deleted_at is null group by tag order by n desc, tag`);
      return rows.map((r) => ({ tag: String(r.tag), count: Number(r.n) }));
    },
    async facets() {
      const distinct = async (col: "channel" | "district" | "segment") => {
        const rows = await db.execute(sql`select distinct ${sql.identifier(col)} as v from leads where deleted_at is null and ${sql.identifier(col)} is not null order by 1 limit 200`);
        return rows.map((r) => String(r.v)).filter(Boolean);
      };
      const [channels, districts, segments] = await Promise.all([distinct("channel"), distinct("district"), distinct("segment")]);
      return { channels, districts, segments };
    },
    async owners() {
      const rows = await db
        .selectDistinct({ id: leads.ownerId, name: sql<string>`coalesce(${people.fullName}, ${leads.ownerName})` })
        .from(leads)
        .leftJoin(people, eq(people.id, leads.ownerId))
        .where(and(isNull(leads.deletedAt), sql`coalesce(${people.fullName}, ${leads.ownerName}, '') <> ''`));
      return rows.sort((a, b) => a.name.localeCompare(b.name));
    },
    async find(id) {
      const [r] = await db
        .select({ lead: leads, ownerName: row.ownerName, clientName: clients.name })
        .from(leads)
        .leftJoin(people, eq(people.id, leads.ownerId))
        .leftJoin(clients, eq(clients.id, leads.clientId))
        .where(and(eq(leads.id, id), isNull(leads.deletedAt)))
        .limit(1);
      if (!r) return null;
      return { ...r.lead, ownerName: r.ownerName, clientName: r.clientName } as LeadDetailRecord;
    },
    async activities(leadId) {
      const rows = await db
        .select({ id: leadActivities.id, type: leadActivities.type, text: leadActivities.text, fromStage: leadActivities.fromStage, toStage: leadActivities.toStage, byName: sql<string | null>`coalesce(${people.fullName}, ${leadActivities.byName})`, at: leadActivities.at })
        .from(leadActivities)
        .leftJoin(people, eq(people.id, leadActivities.byId))
        .where(eq(leadActivities.leadId, leadId))
        .orderBy(desc(leadActivities.at), asc(leadActivities.id));
      return rows as LeadActivityRecord[];
    },
    async lastCopiedAt() {
      const [r] = await db.select({ at: max(leads.copiedAt) }).from(leads);
      return r?.at ?? null;
    },
    async upsertCopies(rows, at, opts = {}) {
      let inserted = 0;
      let updated = 0;
      // A Meta or Google lead that reached Oppllo One directly is the same lead as the CRM's copy: link them.
      const external = rows.flatMap((r) => (r.externalId ? [r.externalId] : []));
      for (let i = 0; i < external.length; i += 1000) {
        await db.update(leads).set({ crmId: sql`${leads.externalId}` }).where(and(isNull(leads.crmId), inArray(leads.externalId, external.slice(i, i + 1000))));
      }
      // Chunks keep each statement well under PostgreSQL's parameter limit.
      for (let i = 0; i < rows.length; i += 200) {
        const values = rows.slice(i, i + 200).map((r) => ({ ...r, id: newId(), copiedAt: at }));
        const result = await db
          .insert(leads)
          .values(values)
          .onConflictDoUpdate({ target: leads.crmId, set: Object.fromEntries((opts.insertOnly ? (["copied_at"] as const) : COPIED).map((c) => [c.replace(/_(\w)/g, (_, x: string) => x.toUpperCase()), sql.raw(`excluded.${c}`)])) })
          // xmax = 0 only for rows this statement inserted.
          .returning({ fresh: sql<boolean>`(xmax = 0)` });
        for (const r of result) {
          if (r.fresh) inserted++;
          else updated++;
        }
      }
      // Leads already set up as clients (D84's won list) point at their client.
      await db.execute(sql`update leads set client_id = c.id from clients c where c.crm_lead_id = leads.crm_id and leads.client_id is null and c.deleted_at is null`);
      return { inserted, updated };
    },
    async removeMissingCopies(keep, at) {
      const gone = await db
        .update(leads)
        .set({ deletedAt: at })
        .where(and(isNull(leads.deletedAt), isNotNull(leads.crmId), keep.length ? notInArray(leads.crmId, [...keep]) : undefined))
        .returning({ id: leads.id });
      return gone.map((g) => g.id);
    },
    async insertActivityCopies(rows) {
      if (!rows.length) return 0;
      const crmIds = [...new Set(rows.map((r) => r.leadCrmId))];
      const idOf = new Map<string | null, string>();
      for (let i = 0; i < crmIds.length; i += 1000) {
        const found = await db.select({ id: leads.id, crmId: leads.crmId }).from(leads).where(inArray(leads.crmId, crmIds.slice(i, i + 1000)));
        for (const l of found) idOf.set(l.crmId, l.id);
      }
      let added = 0;
      const values = rows.flatMap(({ leadCrmId, ...r }) => (idOf.has(leadCrmId) ? [{ ...r, id: newId(), leadId: idOf.get(leadCrmId)! }] : []));
      for (let i = 0; i < values.length; i += 300) {
        const res = await db.insert(leadActivities).values(values.slice(i, i + 300)).onConflictDoNothing({ target: leadActivities.crmId }).returning({ id: leadActivities.id });
        added += res.length;
      }
      return added;
    },
    async lockForUpdate(id) {
      await db.execute(sql`select 1 from leads where id = ${id} for update`);
      return this.find(id);
    },
    async update(id, fields, at) {
      await db.update(leads).set({ ...fields, updatedAt: at }).where(eq(leads.id, id));
    },
    async addActivity(a) {
      await db.insert(leadActivities).values({ id: newId(), leadId: a.leadId, type: a.type, text: a.text, fromStage: a.fromStage ?? null, toStage: a.toStage ?? null, byId: a.byId, at: a.at });
    },
    async queueGoogleConversion(r) {
      const done = await db.insert(googleConversions).values({ id: newId(), ...r }).onConflictDoNothing().returning({ id: googleConversions.id });
      return done.length > 0;
    },
    async googleConversionsSince(since) {
      return db.select({ gclid: googleConversions.gclid, name: googleConversions.name, at: googleConversions.at, valuePaise: googleConversions.valuePaise }).from(googleConversions).where(gte(googleConversions.at, since)).orderBy(asc(googleConversions.at));
    },
    async markConversion(leadId, stage, result, text, at) {
      await db
        .update(leads)
        .set({ details: sql`jsonb_set(coalesce(${leads.details}, '{}'::jsonb), '{conversions}', coalesce(${leads.details}->'conversions', '{}'::jsonb) || ${JSON.stringify({ [stage]: result })}::jsonb)` })
        .where(eq(leads.id, leadId));
      await db.insert(leadActivities).values({ id: newId(), leadId, type: "other", text, byName: "Oppllo One", at });
    },
    async create(row, at) {
      const inserted = await db.insert(leads).values({ ...row, createdAt: at, updatedAt: at }).onConflictDoNothing({ target: leads.externalId }).returning({ id: leads.id });
      if (!inserted.length) return "duplicate";
      await db.insert(leadActivities).values({ id: newId(), leadId: row.id, type: "created", text: `Lead came in${row.channel ? ` from ${row.channel}` : ""}`, at });
      return "created";
    },
    async countSourceLead(key, at) {
      await db.update(leadSources).set({ leadCount: sql`${leadSources.leadCount} + 1`, lastLeadAt: at }).where(eq(leadSources.key, key));
    },
    async upsertSources(rows) {
      if (!rows.length) return 0;
      await db
        .insert(leadSources)
        .values(rows.map((r) => ({ ...r })))
        .onConflictDoUpdate({ target: leadSources.key, set: { name: sql`excluded.name`, url: sql`excluded.url`, channel: sql`excluded.channel`, active: sql`excluded.active`, updatedAt: new Date() } });
      return rows.length;
    },
    async findSource(key) {
      const [r] = await db.select().from(leadSources).where(eq(leadSources.key, key)).limit(1);
      return (r as LeadSourceRecord | undefined) ?? null;
    },
    async listSources() {
      return (await db.select().from(leadSources).orderBy(asc(leadSources.name))) as LeadSourceRecord[];
    },
    async counts() {
      const byStage = await db.select({ stage: leads.stage, n: count() }).from(leads).where(sql`${leads.deletedAt} is null`).groupBy(leads.stage);
      const [acts] = await db.select({ n: count() }).from(leadActivities);
      const [copied] = await db.select({ n: count() }).from(leads).where(and(isNull(leads.deletedAt), isNotNull(leads.crmId)));
      return { leads: byStage.reduce((t, r) => t + r.n, 0), copied: copied?.n ?? 0, byStage: Object.fromEntries(byStage.map((r) => [r.stage, r.n])), activities: acts?.n ?? 0 };
    },
  };
}
