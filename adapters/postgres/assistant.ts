import { and, asc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { assistantDaySummaries, assistantPromises } from "@/db/schema";
import type { AssistantRepository, PromiseRecord } from "@/repositories";
import type { Db } from "./connection";

export function assistantRepository(db: Db): AssistantRepository {
  return {
    async addPromise(row, at) {
      const added = await db
        .insert(assistantPromises)
        .values({ ...row, status: "open", createdAt: at })
        .onConflictDoNothing()
        .returning({ id: assistantPromises.id });
      return added.length > 0;
    },
    promises(personId, statuses) {
      return db
        .select()
        .from(assistantPromises)
        .where(and(eq(assistantPromises.personId, personId), inArray(assistantPromises.status, [...statuses])))
        .orderBy(sql`${assistantPromises.dueOn} asc nulls last`, asc(assistantPromises.createdAt)) as Promise<PromiseRecord[]>;
    },
    async findPromise(id, personId) {
      const [r] = await db.select().from(assistantPromises).where(and(eq(assistantPromises.id, id), eq(assistantPromises.personId, personId)));
      return (r as PromiseRecord | undefined) ?? null;
    },
    async decidePromise(id, personId, patch, at) {
      const r = await db
        .update(assistantPromises)
        .set({ ...patch, decidedAt: at })
        .where(and(eq(assistantPromises.id, id), eq(assistantPromises.personId, personId), inArray(assistantPromises.status, ["open", "reminder"])))
        .returning({ id: assistantPromises.id });
      return r.length > 0;
    },
    dueReminders(day) {
      return db
        .select()
        .from(assistantPromises)
        .where(and(eq(assistantPromises.status, "reminder"), isNull(assistantPromises.remindedAt), lte(assistantPromises.remindOn, day))) as Promise<PromiseRecord[]>;
    },
    async markReminded(ids, at) {
      if (ids.length) await db.update(assistantPromises).set({ remindedAt: at }).where(inArray(assistantPromises.id, [...ids]));
    },
    async daySummary(personId, day) {
      const [r] = await db.select({ s: assistantDaySummaries.summary }).from(assistantDaySummaries).where(and(eq(assistantDaySummaries.personId, personId), eq(assistantDaySummaries.day, day)));
      return r?.s ?? null;
    },
    async saveDaySummary(personId, day, summary) {
      await db.insert(assistantDaySummaries).values({ personId, day, summary }).onConflictDoNothing();
    },
  };
}
