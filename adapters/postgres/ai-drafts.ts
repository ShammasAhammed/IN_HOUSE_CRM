import { and, desc, eq, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { aiDrafts, aiUsage, people } from "@/db/schema";
import type { AiDraftRecord, AiDraftsRepository } from "@/repositories";
import type { Db } from "./connection";

export function aiDraftsRepository(db: Db): AiDraftsRepository {
  function rows(where: SQL): Promise<AiDraftRecord[]> {
    const asker = alias(people, "draft_asker");
    const reviewer = alias(people, "draft_reviewer");
    return db
      .select({
        id: aiDrafts.id,
        taskId: aiDrafts.taskId,
        clientId: aiDrafts.clientId,
        kind: aiDrafts.kind,
        instructions: aiDrafts.instructions,
        body: aiDrafts.body,
        status: aiDrafts.status,
        requestedByName: asker.fullName,
        reviewedByName: reviewer.fullName,
        reviewedAt: aiDrafts.reviewedAt,
        model: aiUsage.model,
        costPaise: aiUsage.costPaise,
        createdAt: aiDrafts.createdAt,
      })
      .from(aiDrafts)
      .innerJoin(asker, eq(asker.id, aiDrafts.requestedById))
      .leftJoin(reviewer, eq(reviewer.id, aiDrafts.reviewedById))
      .leftJoin(aiUsage, eq(aiUsage.id, aiDrafts.aiUsageId))
      .where(where)
      .orderBy(desc(aiDrafts.createdAt));
  }
  return {
    forTask: (taskId) => rows(eq(aiDrafts.taskId, taskId)),
    async find(id) {
      const [r] = await rows(eq(aiDrafts.id, id));
      return r ?? null;
    },
    async create(row) {
      await db.insert(aiDrafts).values(row);
    },
    async decide(id, row, at) {
      const r = await db
        .update(aiDrafts)
        .set({ ...row, reviewedAt: at, updatedAt: at })
        .where(and(eq(aiDrafts.id, id), eq(aiDrafts.status, "draft")))
        .returning({ id: aiDrafts.id });
      return r.length > 0;
    },
  };
}
