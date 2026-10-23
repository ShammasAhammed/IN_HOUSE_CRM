import { and, asc, desc, eq, gt, ilike, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { chatChannels, chatMembers, chatMessages, chatPortalReads, chatReads, clientContacts, clients, people, portalUsers } from "@/db/schema";
import type { StorageProvider } from "@/lib/types";
import type { ChannelRecord, ChatRepository, MessageRecord } from "@/repositories";
import type { Db } from "./connection";
import { q } from "./sql";

// Correlated subqueries with explicit aliases (adapters/postgres/sql.ts on why).
const memberNames = sql<string[]>`coalesce((select array_agg(mp.full_name order by mp.full_name) from chat_members cm join people mp on mp.id = cm.person_id
  where cm.channel_id = ${q(chatChannels.id)} and cm.deleted_at is null), '{}')`;
const unreadFor = (personId: string) => sql<number>`(select count(*)::int from chat_messages um
  left join chat_reads ur on ur.channel_id = um.channel_id and ur.person_id = ${personId}
  where um.channel_id = ${q(chatChannels.id)} and um.author_id is distinct from ${personId} and um.deleted_at is null
    and (ur.last_read_at is null or um.created_at > ur.last_read_at))`;

const messageColumns = {
  id: chatMessages.id,
  channelId: chatMessages.channelId,
  authorId: chatMessages.authorId,
  // A person at Oppllo, or the client's contact behind a portal user (12.6).
  authorName: sql<string>`coalesce(${people.fullName}, ${clientContacts.name}, 'Client')`,
  portalUserId: chatMessages.portalUserId,
  body: chatMessages.body,
  mentions: chatMessages.mentions,
  fileProvider: chatMessages.fileProvider,
  fileLocation: chatMessages.fileLocation,
  fileId: chatMessages.fileId,
  fileName: chatMessages.fileName,
  fileType: chatMessages.fileType,
  fileSize: chatMessages.fileSize,
  createdAt: chatMessages.createdAt,
  updatedAt: chatMessages.updatedAt,
  editedAt: chatMessages.editedAt,
  deletedAt: chatMessages.deletedAt,
  aiReplyTo: chatMessages.aiReplyTo,
  coworkerId: chatMessages.coworkerId,
};
type MessageRow = { [K in keyof typeof messageColumns]: unknown } & Record<string, unknown>;
function toMessage(r: MessageRow): MessageRecord {
  const removed = r.deletedAt !== null;
  return {
    id: r.id as string,
    channelId: r.channelId as string,
    authorId: (r.authorId as string | null) ?? null,
    portalUserId: (r.portalUserId as string | null) ?? null,
    authorName: r.authorName as string,
    // A removed message keeps its place in the conversation, never its words or file.
    body: removed ? "" : (r.body as string),
    mentions: r.mentions as string[],
    file: !removed && r.fileId ? { provider: r.fileProvider as StorageProvider, location: r.fileLocation as string, fileId: r.fileId as string, name: r.fileName as string, type: (r.fileType as string | null) ?? null, size: (r.fileSize as number | null) ?? null } : null,
    createdAt: r.createdAt as Date,
    updatedAt: r.updatedAt as Date,
    editedAt: r.editedAt as Date | null,
    deletedAt: r.deletedAt as Date | null,
    aiReplyTo: (r.aiReplyTo as string | null) ?? null,
    coworkerId: (r.coworkerId as string | null) ?? null,
  };
}

export function chatRepository(db: Db): ChatRepository {
  function channelRows(where: SQL, personId: string | null): Promise<ChannelRecord[]> {
    return db
      .select({
        id: chatChannels.id,
        kind: chatChannels.kind,
        clientId: chatChannels.clientId,
        clientName: clients.name,
        isSpace: sql<boolean>`coalesce(${clients.isInternal}, false)`,
        name: chatChannels.name,
        createdById: chatChannels.createdById,
        archivedAt: chatChannels.archivedAt,
        lastMessageAt: chatChannels.lastMessageAt,
        memberNames,
        unread: personId ? unreadFor(personId) : sql<number>`0`,
      })
      .from(chatChannels)
      .leftJoin(clients, eq(clients.id, chatChannels.clientId))
      .where(where)
      .orderBy(sql`${q(chatChannels.lastMessageAt)} desc nulls last`, asc(chatChannels.createdAt));
  }
  const messageQuery = () =>
    db
      .select(messageColumns)
      .from(chatMessages)
      .leftJoin(people, eq(people.id, chatMessages.authorId))
      .leftJoin(portalUsers, eq(portalUsers.id, chatMessages.portalUserId))
      .leftJoin(clientContacts, eq(clientContacts.id, portalUsers.contactId));

  return {
    channels(personId, clientIds) {
      const mine = sql`${q(chatChannels.id)} in (select m.channel_id from chat_members m where m.person_id = ${personId} and m.deleted_at is null)`;
      return channelRows(or(clientIds.length ? and(inArray(chatChannels.kind, ["client", "shared"]), inArray(chatChannels.clientId, [...clientIds]), isNull(clients.deletedAt)) : undefined, mine)!, personId);
    },
    async find(id) {
      const [r] = await channelRows(eq(chatChannels.id, id), null);
      return r ?? null;
    },
    async clientChannel(clientId, kind = "client") {
      const [r] = await db.select({ id: chatChannels.id }).from(chatChannels).where(and(eq(chatChannels.kind, kind), eq(chatChannels.clientId, clientId))).limit(1);
      return r?.id ?? null;
    },
    async firstClientMessage(clientId) {
      const [r] = await db.execute<{ at: Date | null }>(sql`select min(m.created_at) as at from chat_messages m join chat_channels c on c.id = m.channel_id where c.kind = 'shared' and c.client_id = ${clientId} and m.portal_user_id is not null`);
      return r?.at ? new Date(r.at) : null;
    },
    async markPortalRead(channelId, portalUserId, at) {
      await db.insert(chatPortalReads).values({ channelId, portalUserId, lastReadAt: at }).onConflictDoUpdate({ target: [chatPortalReads.channelId, chatPortalReads.portalUserId], set: { lastReadAt: sql`greatest(${q(chatPortalReads.lastReadAt)}, excluded.last_read_at)` } });
    },
    async portalUnread(channelId, portalUserId) {
      const [r] = await db.execute<{ n: number }>(sql`
        select count(*)::int as n from chat_messages m left join chat_portal_reads r on r.channel_id = m.channel_id and r.portal_user_id = ${portalUserId}
        where m.channel_id = ${channelId} and m.author_id is not null and m.deleted_at is null and (r.last_read_at is null or m.created_at > r.last_read_at)`);
      return Number(r?.n ?? 0);
    },
    async claimAlert(channelId, portalUserId, at, gapMinutes) {
      const since = new Date(at.getTime() - gapMinutes * 60_000).toISOString();
      const r = await db.execute<{ ok: number }>(sql`
        insert into chat_portal_reads (channel_id, portal_user_id, alerted_at) values (${channelId}, ${portalUserId}, ${at.toISOString()})
        on conflict (channel_id, portal_user_id) do update set alerted_at = excluded.alerted_at
        where chat_portal_reads.alerted_at is null or chat_portal_reads.alerted_at < ${since}
        returning 1 as ok`);
      return r.length > 0;
    },
    async waiting(channelIds) {
      if (!channelIds.length) return [];
      const rows = await db.execute<{ channel_id: string; client_id: string; client_name: string; since: Date }>(sql`
        select c.id as channel_id, c.client_id, cl.name as client_name, w.since
        from chat_channels c join clients cl on cl.id = c.client_id
        join lateral (
          select min(m.created_at) as since from chat_messages m
          where m.channel_id = c.id and m.portal_user_id is not null and m.deleted_at is null
            and m.created_at > coalesce((select max(s.created_at) from chat_messages s where s.channel_id = c.id and s.author_id is not null and s.deleted_at is null), 'epoch')
        ) w on w.since is not null
        where c.kind = 'shared' and c.id in (${sql.join(channelIds.map((id) => sql`${id}`), sql`, `)})
        order by w.since`);
      return rows.map((r) => ({ channelId: r.channel_id, clientId: r.client_id, clientName: r.client_name, since: new Date(r.since) }));
    },
    async createChannel(row) {
      const r = await db.insert(chatChannels).values(row).onConflictDoNothing().returning({ id: chatChannels.id });
      return r.length > 0;
    },
    async updateChannel(id, patch) {
      await db.update(chatChannels).set({ ...patch, updatedAt: new Date() }).where(eq(chatChannels.id, id));
    },
    members: (channelId) =>
      db
        .select({ personId: chatMembers.personId, fullName: people.fullName })
        .from(chatMembers)
        .innerJoin(people, eq(people.id, chatMembers.personId))
        .where(and(eq(chatMembers.channelId, channelId), isNull(chatMembers.deletedAt)))
        .orderBy(asc(people.fullName)),
    async addMember(channelId, personId, addedById) {
      await db.insert(chatMembers).values({ channelId, personId, addedById }).onConflictDoUpdate({ target: [chatMembers.channelId, chatMembers.personId], set: { deletedAt: null, addedById } });
    },
    async removeMember(channelId, personId, at) {
      const r = await db.update(chatMembers).set({ deletedAt: at }).where(and(eq(chatMembers.channelId, channelId), eq(chatMembers.personId, personId), isNull(chatMembers.deletedAt))).returning({ p: chatMembers.personId });
      return r.length > 0;
    },
    async directWith(personIds) {
      // The exact member set, compared as one sorted string (ids are uuids, so the commas can't be ambiguous).
      const key = [...personIds].sort().join(",");
      const rows = await db.execute<{ id: string }>(sql`
        select c.id from chat_channels c
        where c.kind = 'direct'
          and (select string_agg(m.person_id::text, ',' order by m.person_id::text) from chat_members m where m.channel_id = c.id and m.deleted_at is null) = ${key}
        limit 1`);
      return rows[0]?.id ?? null;
    },
    async messages(channelId, { before, limit }) {
      const rows = await messageQuery()
        .where(and(eq(chatMessages.channelId, channelId), before ? or(lt(chatMessages.createdAt, before.createdAt), and(eq(chatMessages.createdAt, before.createdAt), lt(chatMessages.id, before.id))) : undefined))
        .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
        .limit(limit);
      return rows.map((r) => toMessage(r as MessageRow));
    },
    async changes(channelId, since, limit) {
      const rows = await messageQuery().where(and(eq(chatMessages.channelId, channelId), gt(chatMessages.updatedAt, since))).orderBy(asc(chatMessages.updatedAt)).limit(limit);
      return rows.map((r) => toMessage(r as MessageRow));
    },
    async findMessage(id) {
      const [r] = await messageQuery().where(eq(chatMessages.id, id)).limit(1);
      return r ? toMessage(r as MessageRow) : null;
    },
    async addMessage(row, at) {
      const f = row.file;
      const added = await db
        .insert(chatMessages)
        .values({
          id: row.id,
          channelId: row.channelId,
          authorId: row.authorId,
          portalUserId: row.portalUserId ?? null,
          body: row.body,
          mentions: row.mentions,
          fileProvider: f?.provider ?? null,
          fileLocation: f?.location ?? null,
          fileId: f?.fileId ?? null,
          fileName: f?.name ?? null,
          fileType: f?.type ?? null,
          fileSize: f?.size ?? null,
          aiReplyTo: row.aiReplyTo ?? null,
          coworkerId: row.coworkerId ?? null,
          createdAt: at,
          updatedAt: at,
        })
        .onConflictDoNothing()
        .returning({ id: chatMessages.id });
      if (!added.length) return false;
      await db.update(chatChannels).set({ lastMessageAt: at }).where(eq(chatChannels.id, row.channelId));
      return true;
    },
    async aiAnswerFor(questionId) {
      const [r] = await db.select({ id: chatMessages.id }).from(chatMessages).where(eq(chatMessages.aiReplyTo, questionId)).limit(1);
      return r?.id ?? null;
    },
    async lastRead(channelId, personId) {
      const [r] = await db.select({ at: chatReads.lastReadAt }).from(chatReads).where(and(eq(chatReads.channelId, channelId), eq(chatReads.personId, personId)));
      return r?.at ?? null;
    },
    async updateMessage(id, patch, at) {
      await db.update(chatMessages).set({ ...patch, updatedAt: at }).where(eq(chatMessages.id, id));
    },
    async markRead(channelId, personId, at) {
      await db.insert(chatReads).values({ channelId, personId, lastReadAt: at }).onConflictDoUpdate({ target: [chatReads.channelId, chatReads.personId], set: { lastReadAt: sql`greatest(${q(chatReads.lastReadAt)}, excluded.last_read_at)` } });
    },
    async search(channelIds, query, limit) {
      if (!channelIds.length) return [];
      const words = query.split(/\s+/).filter(Boolean).slice(0, 5);
      const rows = await db
        .select({ ...messageColumns, channelName: sql<string>`coalesce(${chatChannels.name}, ${clients.name}, 'Direct message')` })
        .from(chatMessages)
        .leftJoin(people, eq(people.id, chatMessages.authorId))
        .leftJoin(portalUsers, eq(portalUsers.id, chatMessages.portalUserId))
        .leftJoin(clientContacts, eq(clientContacts.id, portalUsers.contactId))
        .innerJoin(chatChannels, eq(chatChannels.id, chatMessages.channelId))
        .leftJoin(clients, eq(clients.id, chatChannels.clientId))
        .where(and(inArray(chatMessages.channelId, [...channelIds]), isNull(chatMessages.deletedAt), ...words.map((w) => ilike(chatMessages.body, `%${w.replace(/[\\%_]/g, (c) => `\\${c}`)}%`))))
        .orderBy(desc(chatMessages.createdAt))
        .limit(limit);
      return rows.map((r) => ({ ...toMessage(r as MessageRow), channelName: r.channelName }));
    },
  };
}
