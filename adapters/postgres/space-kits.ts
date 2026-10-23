import { and, count, eq } from "drizzle-orm";
import { spaceKitItems } from "@/db/schema";
import type { SpaceKitsRepository } from "@/repositories";
import type { Db } from "./connection";

export function spaceKitsRepository(db: Db): SpaceKitsRepository {
  return {
    done(spaceId, kit) {
      return db.select({ spaceId: spaceKitItems.spaceId, kit: spaceKitItems.kit, itemKey: spaceKitItems.itemKey, entityType: spaceKitItems.entityType, entityId: spaceKitItems.entityId, createdAt: spaceKitItems.createdAt }).from(spaceKitItems).where(and(eq(spaceKitItems.spaceId, spaceId), eq(spaceKitItems.kit, kit)));
    },
    applied() {
      return db.select({ spaceId: spaceKitItems.spaceId, kit: spaceKitItems.kit, items: count() }).from(spaceKitItems).groupBy(spaceKitItems.spaceId, spaceKitItems.kit);
    },
    async add({ at, ...row }) {
      await db.insert(spaceKitItems).values({ ...row, createdAt: at }).onConflictDoNothing();
    },
  };
}
