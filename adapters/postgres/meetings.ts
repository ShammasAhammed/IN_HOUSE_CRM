import { and, arrayContains, desc, eq, gte, inArray, isNull, lt, lte, ne, or, type SQL } from "drizzle-orm";
import { clients, docs, meetingActions, meetings } from "@/db/schema";
import type { MeetingRecord, MeetingsRepository } from "@/repositories";
import type { Db } from "./connection";

export function meetingsRepository(db: Db): MeetingsRepository {
  const select = (where: SQL | undefined, limit = 500) =>
    db
      .select({
        id: meetings.id,
        docId: meetings.docId,
        title: docs.title,
        body: docs.body,
        docVersion: docs.version,
        clientId: meetings.clientId,
        clientName: clients.name,
        projectId: meetings.projectId,
        kind: meetings.kind,
        meetingDate: meetings.meetingDate,
        startTime: meetings.startTime,
        attendees: meetings.attendees,
        repeat: meetings.repeat,
        previousId: meetings.previousId,
        nextId: meetings.nextId,
        createdById: meetings.createdById,
        createdAt: meetings.createdAt,
      })
      .from(meetings)
      .innerJoin(docs, and(eq(docs.id, meetings.docId), isNull(docs.deletedAt)))
      .leftJoin(clients, eq(clients.id, meetings.clientId))
      .where(and(isNull(meetings.deletedAt), where))
      .orderBy(desc(meetings.meetingDate), desc(meetings.createdAt))
      .limit(limit) as Promise<MeetingRecord[]>;
  return {
    async create({ at, ...row }) {
      await db.insert(meetings).values({ ...row, createdAt: at, updatedAt: at });
    },
    async find(id) {
      return (await select(eq(meetings.id, id), 1))[0] ?? null;
    },
    async byDoc(docId) {
      return (await select(eq(meetings.docId, docId), 1))[0] ?? null;
    },
    list({ clientIds, clientId, kind, from, to, attendee, limit }) {
      const scope = clientIds === "all" ? undefined : clientIds.length ? or(isNull(meetings.clientId), inArray(meetings.clientId, [...clientIds])) : isNull(meetings.clientId);
      return select(
        and(
          scope,
          clientId === null ? isNull(meetings.clientId) : clientId ? eq(meetings.clientId, clientId) : undefined,
          kind ? eq(meetings.kind, kind) : undefined,
          from ? gte(meetings.meetingDate, from) : undefined,
          to ? lte(meetings.meetingDate, to) : undefined,
          attendee ? arrayContains(meetings.attendees, [attendee]) : undefined,
        ),
        limit,
      );
    },
    async update(id, { at, ...patch }) {
      await db.update(meetings).set({ ...patch, updatedAt: at }).where(eq(meetings.id, id));
    },
    dueRepeats(today) {
      return select(and(ne(meetings.repeat, "none"), isNull(meetings.nextId), lt(meetings.meetingDate, today)));
    },
    actions(meetingId) {
      return db.select({ itemKey: meetingActions.itemKey, taskId: meetingActions.taskId }).from(meetingActions).where(eq(meetingActions.meetingId, meetingId));
    },
    async addAction({ at, ...row }) {
      const r = await db.insert(meetingActions).values({ ...row, createdAt: at }).onConflictDoNothing().returning({ id: meetingActions.id });
      return r.length > 0;
    },
  };
}
