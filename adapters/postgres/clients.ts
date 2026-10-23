import { and, asc, desc, eq, inArray, isNull, ne, sql, type SQL } from "drizzle-orm";
import { clientContacts, clientMembers, clients, people, tasks } from "@/db/schema";
import type { ClientRecord, ClientScope, ClientsRepository } from "@/repositories";
import type { Db } from "./connection";
import { liveMember, notHiddenFrom, q } from "./sql";

/** SQL condition limiting clients to a scope. */
export function clientScopeCondition(scope: ClientScope): SQL {
  switch (scope.kind) {
    case "all":
      return scope.viewerId ? notHiddenFrom(clients.id, scope.viewerId) : sql`true`;
    case "none":
      return sql`false`;
    case "assigned":
      return sql`(${q(clients.id)} in (select ${q(clientMembers.clientId)} from ${clientMembers}
          where ${q(clientMembers.personId)} = ${scope.personId} and ${liveMember('"client_members"')})
        or ${q(clients.id)} in (select ${q(tasks.clientId)} from ${tasks}
          where ${q(tasks.ownerId)} = ${scope.personId} and ${q(tasks.deletedAt)} is null))
        and ${notHiddenFrom(clients.id, scope.personId)}`;
    case "own_tasks":
      return sql`${q(clients.id)} in (select ${q(tasks.clientId)} from ${tasks}
        where ${q(tasks.ownerId)} = ${scope.personId} and ${q(tasks.deletedAt)} is null) and ${notHiddenFrom(clients.id, scope.personId)}`;
  }
}

const columns = {
  id: clients.id,
  name: clients.name,
  segment: clients.segment,
  city: clients.city,
  status: clients.status,
  startDate: clients.startDate,
  isInternal: clients.isInternal,
  isPrivate: clients.isPrivate,
  isSensitive: clients.isSensitive,
  isSelf: clients.isSelf,
  accessReviewedAt: clients.accessReviewedAt,
  leadId: people.id,
  leadName: people.fullName,
  teamSize: sql<number>`(select count(*)::int from ${clientMembers}
    where ${q(clientMembers.clientId)} = ${q(clients.id)} and ${liveMember('"client_members"')})`,
};

type Row = { leadId: string | null; leadName: string | null } & Omit<ClientRecord, "leadStrategist">;

const toRecord = ({ leadId, leadName, ...rest }: Row): ClientRecord => ({
  ...rest,
  leadStrategist: leadId && leadName ? { id: leadId, fullName: leadName } : null,
});

export function clientsRepository(db: Db): ClientsRepository {
  const base = () => db.select(columns).from(clients).leftJoin(people, eq(people.id, clients.leadStrategistId));

  return {
    async list(scope) {
      const rows = await base()
        .where(and(isNull(clients.deletedAt), eq(clients.isInternal, false), clientScopeCondition(scope)))
        .orderBy(asc(clients.name));
      return rows.map(toRecord);
    },
    async findById(id, scope) {
      const [row] = await base()
        .where(and(eq(clients.id, id), isNull(clients.deletedAt), clientScopeCondition(scope)))
        .limit(1);
      return row ? toRecord(row) : null;
    },
    async listMembers(clientId) {
      return db
        .select({ personId: clientMembers.personId, fullName: people.fullName, note: clientMembers.note, level: clientMembers.level, expiresOn: clientMembers.expiresOn, since: clientMembers.createdAt })
        .from(clientMembers)
        .innerJoin(people, eq(people.id, clientMembers.personId))
        .where(and(eq(clientMembers.clientId, clientId), liveMember('"client_members"')))
        .orderBy(asc(people.fullName));
    },
    async listContacts(clientIds) {
      if (clientIds.length === 0) return [];
      return db
        .select({
          id: clientContacts.id,
          clientId: clientContacts.clientId,
          name: clientContacts.name,
          designation: clientContacts.designation,
          phone: clientContacts.phone,
          email: clientContacts.email,
          whatsapp: clientContacts.whatsapp,
          isPrimary: clientContacts.isPrimary,
        })
        .from(clientContacts)
        .where(and(inArray(clientContacts.clientId, [...clientIds]), isNull(clientContacts.deletedAt)))
        .orderBy(desc(clientContacts.isPrimary), asc(clientContacts.name));
    },
    async findDetails(id) {
      const [row] = await db
        .select({
          id: clients.id,
          name: clients.name,
          legalName: clients.legalName,
          segment: clients.segment,
          city: clients.city,
          status: clients.status,
          startDate: clients.startDate,
          gstin: clients.gstin,
          billingAddress: clients.billingAddress,
          crmLeadId: clients.crmLeadId,
          leadStrategistId: clients.leadStrategistId,
          notes: clients.notes,
          driveFolderUrl: clients.driveFolderUrl,
        })
        .from(clients)
        .where(and(eq(clients.id, id), isNull(clients.deletedAt)))
        .limit(1);
      return row ?? null;
    },
    async findByName(name, exceptId) {
      const [row] = await db
        .select({ id: clients.id, name: clients.name })
        .from(clients)
        .where(and(sql`lower(${q(clients.name)}) = lower(${name.trim()})`, isNull(clients.deletedAt), exceptId ? ne(clients.id, exceptId) : undefined))
        .limit(1);
      return row ?? null;
    },
    async create(id, client) {
      await db.insert(clients).values({ id, ...client });
    },
    async update(id, patch) {
      await db.update(clients).set({ ...patch, updatedAt: new Date() }).where(eq(clients.id, id));
    },
    async findContact(id) {
      const [row] = await db
        .select({
          id: clientContacts.id,
          clientId: clientContacts.clientId,
          name: clientContacts.name,
          designation: clientContacts.designation,
          phone: clientContacts.phone,
          email: clientContacts.email,
          whatsapp: clientContacts.whatsapp,
          isPrimary: clientContacts.isPrimary,
        })
        .from(clientContacts)
        .where(and(eq(clientContacts.id, id), isNull(clientContacts.deletedAt)))
        .limit(1);
      return row ?? null;
    },
    async addContact(id, clientId, contact) {
      await db.insert(clientContacts).values({ id, clientId, ...contact });
    },
    async updateContact(id, patch) {
      await db.update(clientContacts).set({ ...patch, updatedAt: new Date() }).where(eq(clientContacts.id, id));
    },
    async clearPrimaryContact(clientId, exceptId) {
      await db
        .update(clientContacts)
        .set({ isPrimary: false, updatedAt: new Date() })
        .where(and(eq(clientContacts.clientId, clientId), ne(clientContacts.id, exceptId), eq(clientContacts.isPrimary, true)));
    },
    async addMember(clientId, personId) {
      await db
        .insert(clientMembers)
        .values({ clientId, personId })
        .onConflictDoUpdate({ target: [clientMembers.clientId, clientMembers.personId], set: { deletedAt: null } });
    },
    async listTeamsOf(personId) {
      return db
        .select({ id: clients.id, name: clients.name })
        .from(clientMembers)
        .innerJoin(clients, eq(clients.id, clientMembers.clientId))
        .where(and(eq(clientMembers.personId, personId), isNull(clientMembers.deletedAt), isNull(clients.deletedAt), eq(clients.isInternal, false)))
        .orderBy(asc(clients.name));
    },
    async listSpaces(scope) {
      const rows = await base()
        .where(and(isNull(clients.deletedAt), eq(clients.isInternal, true), clientScopeCondition(scope)))
        .orderBy(asc(clients.name));
      return rows.map(toRecord);
    },
    async createSpace(id, space) {
      await db.insert(clients).values({ id, name: space.name, isPrivate: space.isPrivate, isInternal: true, status: "active", segment: "other" });
    },
    async updateSpace(id, patch) {
      // One self space at most: marking one clears any other first.
      if (patch.isSelf) await db.update(clients).set({ isSelf: false }).where(and(eq(clients.isSelf, true), ne(clients.id, id)));
      await db.update(clients).set({ ...patch, updatedAt: new Date() }).where(and(eq(clients.id, id), eq(clients.isInternal, true)));
    },
    async selfSpaceId() {
      const [r] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.isSelf, true), isNull(clients.deletedAt)));
      return r?.id ?? null;
    },
    async visibleIds(scope) {
      const rows = await db.select({ id: clients.id }).from(clients).where(and(isNull(clients.deletedAt), clientScopeCondition(scope)));
      return rows.map((r) => r.id);
    },
    async hiddenSpaces(personId) {
      const rows = await db.select({ id: clients.id }).from(clients).where(sql`not (${notHiddenFrom(clients.id, personId)})`);
      return rows.map((r) => r.id);
    },
    async outsidersOnWork(clientId) {
      const rows = await db.execute<{ person_id: string }>(sql`
        select distinct w.person_id from (
          select t.owner_id as person_id from tasks t where t.client_id = ${clientId} and t.deleted_at is null and t.status <> 'done'
          union select t.reviewer_id from tasks t where t.client_id = ${clientId} and t.deleted_at is null and t.status <> 'done'
          union select tp.person_id from task_people tp join tasks t on t.id = tp.task_id
            where t.client_id = ${clientId} and t.deleted_at is null and t.status <> 'done' and tp.deleted_at is null
          union select r.owner_id from task_recurrences r where r.client_id = ${clientId} and r.active and r.deleted_at is null
          union select r.reviewer_id from task_recurrences r where r.client_id = ${clientId} and r.active and r.deleted_at is null
          union select f.owner_id from request_forms f join projects p on p.id = f.project_id
            where p.client_id = ${clientId} and f.active and f.deleted_at is null
          union select c.lead_strategist_id from clients c where c.id = ${clientId}
        ) w
        where w.person_id is not null
          and w.person_id not in (select m.person_id from client_members m where m.client_id = ${clientId} and ${liveMember("m")})`);
      return rows.map((r) => r.person_id);
    },
    async setMember(row) {
      // A fresh grant starts its "since" today, also when it restores an old membership.
      await db
        .insert(clientMembers)
        .values({ clientId: row.clientId, personId: row.personId, level: row.level, expiresOn: row.expiresOn, requestId: row.requestId })
        .onConflictDoUpdate({
          target: [clientMembers.clientId, clientMembers.personId],
          set: { level: row.level, expiresOn: row.expiresOn, requestId: row.requestId, deletedAt: null, createdAt: sql`case when ${q(clientMembers.deletedAt)} is null then ${q(clientMembers.createdAt)} else now() end` },
        });
    },
    async spaceMembershipsOf(personId) {
      return db
        .select({ spaceId: clients.id, name: clients.name, isPrivate: clients.isPrivate, isSensitive: clients.isSensitive, level: clientMembers.level, expiresOn: clientMembers.expiresOn, since: clientMembers.createdAt })
        .from(clientMembers)
        .innerJoin(clients, eq(clients.id, clientMembers.clientId))
        .where(and(eq(clientMembers.personId, personId), liveMember('"client_members"'), isNull(clients.deletedAt), eq(clients.isInternal, true)))
        .orderBy(asc(clients.name));
    },
    async spaceMembersEnding({ from, to, before }) {
      const rows = await db
        .select({ spaceId: clients.id, spaceName: clients.name, personId: clientMembers.personId, fullName: people.fullName, expiresOn: clientMembers.expiresOn })
        .from(clientMembers)
        .innerJoin(clients, eq(clients.id, clientMembers.clientId))
        .innerJoin(people, eq(people.id, clientMembers.personId))
        .where(
          and(
            isNull(clientMembers.deletedAt),
            eq(clients.isInternal, true),
            sql`${q(clientMembers.expiresOn)} is not null`,
            from ? sql`${q(clientMembers.expiresOn)} >= ${from}` : undefined,
            to ? sql`${q(clientMembers.expiresOn)} <= ${to}` : undefined,
            before ? sql`${q(clientMembers.expiresOn)} < ${before}` : undefined,
          ),
        )
        .orderBy(asc(clientMembers.expiresOn));
      return rows.map((r) => ({ ...r, expiresOn: r.expiresOn! }));
    },
    async markReviewed(spaceId, at) {
      await db.update(clients).set({ accessReviewedAt: at }).where(and(eq(clients.id, spaceId), eq(clients.isInternal, true)));
    },
    async removeMember(clientId, personId) {
      const rows = await db
        .update(clientMembers)
        .set({ deletedAt: new Date() })
        .where(and(eq(clientMembers.clientId, clientId), eq(clientMembers.personId, personId), isNull(clientMembers.deletedAt)))
        .returning({ personId: clientMembers.personId });
      return rows.length > 0;
    },
  };
}
