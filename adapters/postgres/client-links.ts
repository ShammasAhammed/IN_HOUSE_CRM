import { and, desc, eq, gte, isNotNull, isNull } from "drizzle-orm";
import { clientLinkCache, clientLinks, clients } from "@/db/schema";
import type { ClientLinkRecord, ClientLinksRepository } from "@/repositories";
import type { Db } from "./connection";

export function clientLinksRepository(db: Db): ClientLinksRepository {
  return {
    async add(row) {
      await db.insert(clientLinks).values(row);
    },
    async find(id) {
      const [r] = await db.select().from(clientLinks).where(and(eq(clientLinks.id, id), isNull(clientLinks.deletedAt)));
      return (r as ClientLinkRecord | undefined) ?? null;
    },
    list(clientId) {
      return db.select().from(clientLinks).where(and(eq(clientLinks.clientId, clientId), isNull(clientLinks.deletedAt))).orderBy(desc(clientLinks.createdAt)) as Promise<ClientLinkRecord[]>;
    },
    async update(id, patch) {
      await db.update(clientLinks).set(patch).where(eq(clientLinks.id, id));
    },
    async remove(id, at) {
      const r = await db.update(clientLinks).set({ deletedAt: at }).where(and(eq(clientLinks.id, id), isNull(clientLinks.deletedAt))).returning({ id: clientLinks.id });
      return r.length > 0;
    },
    async allGoogle() {
      const rows = await db
        .select({ link: clientLinks })
        .from(clientLinks)
        .innerJoin(clients, eq(clients.id, clientLinks.clientId))
        .where(and(isNull(clientLinks.deletedAt), isNotNull(clientLinks.googleId), isNull(clients.deletedAt)));
      return rows.map((r) => r.link as ClientLinkRecord);
    },
    async cacheGet(linkId, key, since) {
      const [r] = await db.select({ value: clientLinkCache.value }).from(clientLinkCache).where(and(eq(clientLinkCache.linkId, linkId), eq(clientLinkCache.key, key), gte(clientLinkCache.fetchedAt, since)));
      return r?.value ?? null;
    },
    async cachePut(linkId, key, value, at) {
      await db.insert(clientLinkCache).values({ linkId, key, value, fetchedAt: at }).onConflictDoUpdate({ target: [clientLinkCache.linkId, clientLinkCache.key], set: { value, fetchedAt: at } });
    },
  };
}
