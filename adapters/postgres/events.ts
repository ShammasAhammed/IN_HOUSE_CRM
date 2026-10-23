import { and, desc, eq, gte, inArray, lt, notInArray, or, sql } from "drizzle-orm";
import { clients, events, people } from "@/db/schema";
import { newId } from "@/lib/id";
import type { AuditRow, EventRow, EventsRepository } from "@/repositories";
import type { Db } from "./connection";

export function eventsRepository(db: Db): EventsRepository {
  return {
    async search({ actorId, entityType, clientId, from, to, offset, limit }) {
      // shortcut: offset paging; fine for the owner's occasional look, move to a (occurred_at, id) cursor if it slows.
      const rows = await db
        .select({
          id: events.id,
          occurredAt: events.occurredAt,
          actorId: events.actorId,
          actorName: people.fullName,
          action: events.action,
          entityType: events.entityType,
          entityId: events.entityId,
          data: events.data,
          clientId: events.clientId,
          clientName: clients.name,
        })
        .from(events)
        .leftJoin(people, eq(people.id, events.actorId))
        .leftJoin(clients, eq(clients.id, events.clientId))
        .where(
          and(
            actorId ? eq(events.actorId, actorId) : undefined,
            entityType ? eq(events.entityType, entityType) : undefined,
            clientId ? eq(events.clientId, clientId) : undefined,
            from ? gte(events.occurredAt, from) : undefined,
            to ? lt(events.occurredAt, to) : undefined,
          ),
        )
        .orderBy(desc(events.occurredAt), desc(events.id))
        .limit(limit)
        .offset(offset);
      return rows as AuditRow[];
    },
    async record(e) {
      await db.insert(events).values({
        id: newId(),
        actorId: e.actorId,
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId,
        clientId: e.clientId ?? null,
        personId: e.personId ?? null,
        data: e.data ?? {},
      });
    },
    async listForClient(clientId, opts) {
      const rows = await db
        .select({
          id: events.id,
          occurredAt: events.occurredAt,
          actorName: people.fullName,
          action: events.action,
          entityType: events.entityType,
          entityId: events.entityId,
          data: events.data,
        })
        .from(events)
        .leftJoin(people, eq(people.id, events.actorId))
        .where(
          and(
            eq(events.clientId, clientId),
            opts.excludeActions?.length ? notInArray(events.action, [...opts.excludeActions]) : undefined,
            opts.entityTypes ? inArray(events.entityType, [...opts.entityTypes]) : undefined,
          ),
        )
        .orderBy(desc(events.occurredAt))
        .limit(opts.limit);
      return rows as EventRow[];
    },
    async listForTask({ taskId, assetIds, contentIds, limit }) {
      const rows = await db
        .select({
          id: events.id,
          occurredAt: events.occurredAt,
          actorId: events.actorId,
          actorName: people.fullName,
          action: events.action,
          entityType: events.entityType,
          entityId: events.entityId,
          data: events.data,
        })
        .from(events)
        .leftJoin(people, eq(people.id, events.actorId))
        .where(
          or(
            and(eq(events.entityType, "task"), eq(events.entityId, taskId)),
            and(eq(events.entityType, "time_entry"), sql`${events.data}->>'taskId' = ${taskId}`),
            assetIds.length ? and(eq(events.entityType, "asset"), inArray(events.entityId, [...assetIds])) : undefined,
            contentIds.length ? and(eq(events.entityType, "content_item"), inArray(events.entityId, [...contentIds])) : undefined,
          ),
        )
        .orderBy(desc(events.occurredAt), desc(events.id))
        .limit(limit);
      return rows as EventRow[];
    },
    async listForEntity(entityType, entityId, limit) {
      const rows = await db
        .select({
          id: events.id,
          occurredAt: events.occurredAt,
          actorId: events.actorId,
          actorName: people.fullName,
          action: events.action,
          entityType: events.entityType,
          entityId: events.entityId,
          data: events.data,
        })
        .from(events)
        .leftJoin(people, eq(people.id, events.actorId))
        .where(and(eq(events.entityType, entityType), eq(events.entityId, entityId)))
        .orderBy(desc(events.occurredAt), desc(events.id))
        .limit(limit);
      return rows as EventRow[];
    },
  };
}
