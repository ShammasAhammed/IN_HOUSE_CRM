import { and, asc, eq, gte, isNull, lte, ne, sql } from "drizzle-orm";
import { assets, contentItems, people } from "@/db/schema";
import type { ContentItemRecord, ContentRepository } from "@/repositories";
import type { Db } from "./connection";
import { q } from "./sql";

const columns = {
  id: contentItems.id,
  clientId: contentItems.clientId,
  title: contentItems.title,
  channel: contentItems.channel,
  publishOn: contentItems.publishOn,
  publishTime: contentItems.publishTime,
  status: contentItems.status,
  assetId: contentItems.assetId,
  assetTitle: assets.title,
  assetState: assets.approvalState,
  ownerId: contentItems.ownerId,
  ownerName: people.fullName,
  caption: contentItems.caption,
  publishedUrl: contentItems.publishedUrl,
};

export function contentRepository(db: Db): ContentRepository {
  const select = () =>
    db
      .select(columns)
      .from(contentItems)
      .leftJoin(assets, and(eq(assets.id, contentItems.assetId), isNull(assets.deletedAt)))
      .leftJoin(people, eq(people.id, contentItems.ownerId));
  const order = [asc(contentItems.publishOn), sql`${q(contentItems.publishTime)} nulls last`, asc(contentItems.createdAt)];
  return {
    async list({ clientId, from, to }) {
      const rows = await select()
        .where(and(eq(contentItems.clientId, clientId), gte(contentItems.publishOn, from), lte(contentItems.publishOn, to), isNull(contentItems.deletedAt)))
        .orderBy(...order);
      return rows as ContentItemRecord[];
    },
    async upcoming(clientId, from, limit) {
      const rows = await select()
        .where(and(eq(contentItems.clientId, clientId), gte(contentItems.publishOn, from), ne(contentItems.status, "published"), isNull(contentItems.deletedAt)))
        .orderBy(...order)
        .limit(limit);
      return rows as ContentItemRecord[];
    },
    async findById(id) {
      const [row] = await select().where(and(eq(contentItems.id, id), isNull(contentItems.deletedAt))).limit(1);
      return (row as ContentItemRecord | undefined) ?? null;
    },
    async listByAsset(assetId) {
      const rows = await select().where(and(eq(contentItems.assetId, assetId), isNull(contentItems.deletedAt))).orderBy(...order);
      return rows as ContentItemRecord[];
    },
    async lockForUpdate(id) {
      await db.execute(sql`select 1 from ${contentItems} where ${q(contentItems.id)} = ${id} for update`);
    },
    async create(id, item) {
      await db.insert(contentItems).values({ id, ...item });
    },
    async update(id, patch) {
      await db.update(contentItems).set({ ...patch, updatedAt: new Date() }).where(eq(contentItems.id, id));
    },
  };
}
