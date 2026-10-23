import { and, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { clients, linkPreviews, people, shareInbox, swipeItems } from "@/db/schema";
import type { ShareRecord, SwipeItemRecord, SwipeRepository } from "@/repositories";
import type { Db } from "./connection";

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export function swipeRepository(db: Db): SwipeRepository {
  const rows = (where: ReturnType<typeof and>, limit = 300) =>
    db
      .select({
        id: swipeItems.id,
        clientId: swipeItems.clientId,
        clientName: clients.name,
        boardId: swipeItems.boardId,
        kind: swipeItems.kind,
        url: swipeItems.url,
        title: swipeItems.title,
        description: swipeItems.description,
        imageUrl: swipeItems.imageUrl,
        site: swipeItems.site,
        embedHtml: swipeItems.embedHtml,
        fileProvider: swipeItems.fileProvider,
        fileLocation: swipeItems.fileLocation,
        fileId: swipeItems.fileId,
        fileName: swipeItems.fileName,
        fileSize: swipeItems.fileSize,
        contentType: swipeItems.contentType,
        notes: swipeItems.notes,
        tags: swipeItems.tags,
        createdById: swipeItems.createdById,
        createdByName: people.fullName,
        createdAt: swipeItems.createdAt,
        updatedAt: swipeItems.updatedAt,
      })
      .from(swipeItems)
      .innerJoin(clients, eq(clients.id, swipeItems.clientId))
      .leftJoin(people, eq(people.id, swipeItems.createdById))
      .where(where)
      .orderBy(desc(swipeItems.createdAt))
      .limit(limit) as Promise<SwipeItemRecord[]>;
  return {
    async add({ at, ...row }) {
      await db.insert(swipeItems).values({ ...row, createdAt: at, updatedAt: at });
    },
    async find(id) {
      const [r] = await rows(and(eq(swipeItems.id, id), isNull(swipeItems.deletedAt)), 1);
      return r ?? null;
    },
    list({ clientIds, q, tag, kind, createdById, from, to, limit }) {
      if (!clientIds.length) return Promise.resolve([]);
      const text = q?.trim() ? `%${escapeLike(q.trim())}%` : null;
      return rows(
        and(
          inArray(swipeItems.clientId, [...clientIds]),
          isNull(swipeItems.deletedAt),
          text ? or(ilike(swipeItems.searchText, text), ilike(swipeItems.title, text)) : undefined,
          tag ? sql`${tag} = any(${swipeItems.tags})` : undefined,
          kind ? eq(swipeItems.kind, kind) : undefined,
          createdById ? eq(swipeItems.createdById, createdById) : undefined,
          from ? gte(swipeItems.createdAt, from) : undefined,
          to ? lte(swipeItems.createdAt, to) : undefined,
        ),
        limit,
      );
    },
    async update(id, { at, ...patch }) {
      await db.update(swipeItems).set({ ...patch, updatedAt: at }).where(eq(swipeItems.id, id));
    },
    async remove(id, at) {
      const r = await db.update(swipeItems).set({ deletedAt: at }).where(and(eq(swipeItems.id, id), isNull(swipeItems.deletedAt))).returning({ id: swipeItems.id });
      return r.length > 0;
    },
    async tags(clientIds) {
      if (!clientIds.length) return [];
      const r = await db.execute<{ tag: string }>(
        sql`select t as tag from swipe_items, unnest(tags) t where deleted_at is null and client_id in (${sql.join(
          clientIds.map((c) => sql`${c}`),
          sql`, `,
        )}) group by t order by count(*) desc, t limit 60`,
      );
      return r.map((x) => x.tag);
    },
    async savers(clientIds) {
      if (!clientIds.length) return [];
      return db
        .selectDistinct({ id: people.id, name: people.fullName })
        .from(swipeItems)
        .innerJoin(people, eq(people.id, swipeItems.createdById))
        .where(and(inArray(swipeItems.clientId, [...clientIds]), isNull(swipeItems.deletedAt)))
        .orderBy(people.fullName);
    },
    async previewGet(url, since) {
      const [r] = await db.select({ data: linkPreviews.data }).from(linkPreviews).where(and(eq(linkPreviews.url, url), gte(linkPreviews.fetchedAt, since)));
      return r?.data ?? null;
    },
    async previewPut(url, data, at) {
      await db.insert(linkPreviews).values({ url, data, fetchedAt: at }).onConflictDoUpdate({ target: linkPreviews.url, set: { data, fetchedAt: at } });
    },
    async shareAdd({ at, ...row }) {
      await db.insert(shareInbox).values({ ...row, createdAt: at });
    },
    async share(id) {
      const [r] = await db.select().from(shareInbox).where(eq(shareInbox.id, id));
      return (r as ShareRecord | undefined) ?? null;
    },
    async shareUsed(id, at) {
      await db.update(shareInbox).set({ usedAt: at }).where(eq(shareInbox.id, id));
    },
  };
}
