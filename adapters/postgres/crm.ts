import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { clients, crmWonLeads } from "@/db/schema";
import type { CrmInboxRepository, WonLeadRecord } from "@/repositories";
import { newId } from "@/lib/id";
import type { Db } from "./connection";

const columns = {
  rowId: crmWonLeads.id,
  id: crmWonLeads.crmLeadId,
  name: crmWonLeads.name,
  institution: crmWonLeads.institution,
  phone: crmWonLeads.phone,
  segment: crmWonLeads.segment,
  ownerName: crmWonLeads.ownerName,
  stage: sql<string>`'won'`,
  wonAt: crmWonLeads.wonAt,
  dismissedAt: crmWonLeads.dismissedAt,
  clientId: clients.id,
  clientName: clients.name,
};

export function crmInboxRepository(db: Db): CrmInboxRepository {
  const select = () => db.select(columns).from(crmWonLeads).leftJoin(clients, and(eq(clients.crmLeadId, crmWonLeads.crmLeadId), isNull(clients.deletedAt)));
  return {
    async upsert(leads) {
      if (!leads.length) return 0;
      const rows = leads.map((l) => ({ id: newId(), crmLeadId: l.id, name: l.name, institution: l.institution, phone: l.phone, segment: l.segment, ownerName: l.ownerName, wonAt: l.wonAt }));
      const inserted = await db
        .insert(crmWonLeads)
        .values(rows)
        .onConflictDoUpdate({ target: crmWonLeads.crmLeadId, set: { name: sql`excluded.name`, institution: sql`excluded.institution`, phone: sql`excluded.phone`, segment: sql`excluded.segment`, ownerName: sql`excluded.owner_name`, wonAt: sql`excluded.won_at`, updatedAt: new Date() } })
        .returning({ id: crmWonLeads.id });
      return inserted.length;
    },
    async list({ includeDone }) {
      const rows = await select()
        .where(includeDone ? undefined : and(isNull(crmWonLeads.dismissedAt), isNull(clients.id)))
        .orderBy(desc(crmWonLeads.wonAt));
      return rows as WonLeadRecord[];
    },
    async find(rowId) {
      const [row] = await select().where(eq(crmWonLeads.id, rowId)).limit(1);
      return (row as WonLeadRecord | undefined) ?? null;
    },
    async dismiss(rowId, by, at) {
      await db.update(crmWonLeads).set({ dismissedAt: at, dismissedById: by, updatedAt: at }).where(eq(crmWonLeads.id, rowId));
    },
  };
}
