import { and, desc, eq, inArray, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { clients, people, spaceAccessRequests } from "@/db/schema";
import type { AccessRequestRecord, SpaceAccessRepository } from "@/repositories";
import type { Db } from "./connection";

export function spaceAccessRepository(db: Db): SpaceAccessRepository {
  function rows(where: SQL | undefined): Promise<AccessRequestRecord[]> {
    const member = alias(people, "access_member");
    const asker = alias(people, "access_asker");
    const decider = alias(people, "access_decider");
    const r = spaceAccessRequests;
    return db
      .select({
        id: r.id,
        spaceId: r.spaceId,
        spaceName: clients.name,
        isPrivate: clients.isPrivate,
        isSensitive: clients.isSensitive,
        personId: r.personId,
        personName: member.fullName,
        level: r.level,
        reason: r.reason,
        expiresOn: r.expiresOn,
        twoStep: r.twoStep,
        status: r.status,
        requestedById: r.requestedById,
        requestedByName: asker.fullName,
        decidedById: r.decidedById,
        decidedByName: decider.fullName,
        decidedAt: r.decidedAt,
        decisionNote: r.decisionNote,
        ownerAlone: r.ownerAlone,
        confirmedAt: r.confirmedAt,
        createdAt: r.createdAt,
      })
      .from(r)
      .innerJoin(clients, eq(clients.id, r.spaceId))
      .innerJoin(member, eq(member.id, r.personId))
      .innerJoin(asker, eq(asker.id, r.requestedById))
      .leftJoin(decider, eq(decider.id, r.decidedById))
      .where(where)
      .orderBy(desc(r.createdAt));
  }
  return {
    async create(row) {
      // The partial unique index allows one open request per person and space; a second one is refused.
      const r = await db.insert(spaceAccessRequests).values(row).onConflictDoNothing().returning({ id: spaceAccessRequests.id });
      return r.length > 0;
    },
    async find(id) {
      const [r] = await rows(eq(spaceAccessRequests.id, id));
      return r ?? null;
    },
    list: ({ statuses, personId, spaceId }) =>
      rows(
        and(
          statuses ? inArray(spaceAccessRequests.status, [...statuses]) : undefined,
          personId ? eq(spaceAccessRequests.personId, personId) : undefined,
          spaceId ? eq(spaceAccessRequests.spaceId, spaceId) : undefined,
        ),
      ),
    async update(id, from, patch, at) {
      const r = await db
        .update(spaceAccessRequests)
        .set({ ...patch, updatedAt: at })
        .where(and(eq(spaceAccessRequests.id, id), eq(spaceAccessRequests.status, from)))
        .returning({ id: spaceAccessRequests.id });
      return r.length > 0;
    },
  };
}
