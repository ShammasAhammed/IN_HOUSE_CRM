import { and, eq, isNull, sql } from "drizzle-orm";
import { adInsightCache, clientAdAccounts } from "@/db/schema";
import type { AdInsights, AdsRepository } from "@/repositories";
import type { Db } from "./connection";

export function adsRepository(db: Db): AdsRepository {
  const live = (clientId: string) => and(eq(clientAdAccounts.clientId, clientId), eq(clientAdAccounts.platform, "meta"), isNull(clientAdAccounts.deletedAt));
  return {
    async accountFor(clientId) {
      const [r] = await db.select({ id: clientAdAccounts.id, accountId: clientAdAccounts.accountId }).from(clientAdAccounts).where(live(clientId)).limit(1);
      return r ?? null;
    },
    async link(row) {
      await db.insert(clientAdAccounts).values({ ...row, platform: "meta" });
    },
    async unlink(clientId, at) {
      const [r] = await db.update(clientAdAccounts).set({ deletedAt: at }).where(live(clientId)).returning({ id: clientAdAccounts.id });
      // A different account means different numbers: drop what was cached for this client.
      await db.delete(adInsightCache).where(eq(adInsightCache.clientId, clientId));
      return r?.id ?? null;
    },
    async cached(clientId, rangeKey) {
      const [r] = await db.select().from(adInsightCache).where(and(eq(adInsightCache.clientId, clientId), eq(adInsightCache.rangeKey, rangeKey))).limit(1);
      return r ? { data: r.data as AdInsights, fetchedAt: r.fetchedAt } : null;
    },
    async store(clientId, rangeKey, data, at) {
      await db
        .insert(adInsightCache)
        .values({ clientId, rangeKey, data, fetchedAt: at })
        .onConflictDoUpdate({ target: [adInsightCache.clientId, adInsightCache.rangeKey], set: { data: sql`excluded.data`, fetchedAt: at } });
    },
  };
}
