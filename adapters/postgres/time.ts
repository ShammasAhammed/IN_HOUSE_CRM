import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { clients, people, tasks, timeEntries, timers } from "@/db/schema";
import type { TimeEntryRow, TimeRepository } from "@/repositories";
import type { Db } from "./connection";
import { q } from "./sql";

export function timeRepository(db: Db): TimeRepository {
  const timerMethods: Pick<TimeRepository, "runningTimer" | "startTimer" | "stopTimer"> = {
    async runningTimer(personId) {
      const [row] = await db
        .select({ id: timers.id, taskId: timers.taskId, taskTitle: tasks.title, clientName: clients.name, startedAt: timers.startedAt })
        .from(timers)
        .innerJoin(tasks, eq(tasks.id, timers.taskId))
        .innerJoin(clients, eq(clients.id, tasks.clientId))
        .where(and(eq(timers.personId, personId), isNull(timers.stoppedAt), isNull(timers.deletedAt)))
        .limit(1);
      return row ?? null;
    },
    async startTimer(row) {
      await db.insert(timers).values(row);
    },
    async stopTimer(id, at, timeEntryId) {
      const r = await db.update(timers).set({ stoppedAt: at, timeEntryId }).where(and(eq(timers.id, id), isNull(timers.stoppedAt))).returning({ id: timers.id });
      return r.length > 0;
    },
  };
  const select = () =>
    db
      .select({
        id: timeEntries.id,
        taskId: timeEntries.taskId,
        taskTitle: tasks.title,
        personId: timeEntries.personId,
        personName: people.fullName,
        clientId: timeEntries.clientId,
        clientName: clients.name,
        engagementId: timeEntries.engagementId,
        workDate: timeEntries.workDate,
        minutes: timeEntries.minutes,
        billable: timeEntries.billable,
        note: timeEntries.note,
        createdAt: timeEntries.createdAt,
      })
      .from(timeEntries)
      .innerJoin(tasks, eq(tasks.id, timeEntries.taskId))
      .innerJoin(people, eq(people.id, timeEntries.personId))
      .innerJoin(clients, eq(clients.id, timeEntries.clientId));

  return {
    ...timerMethods,
    async add(id, entry) {
      await db.insert(timeEntries).values({ id, ...entry });
    },
    async findById(id) {
      const [row] = await select().where(and(eq(timeEntries.id, id), isNull(timeEntries.deletedAt))).limit(1);
      return (row as TimeEntryRow | undefined) ?? null;
    },
    async update(id, patch) {
      await db.update(timeEntries).set({ ...patch, updatedAt: new Date() }).where(eq(timeEntries.id, id));
    },
    async list(filter) {
      const rows = await select()
        .where(
          and(
            isNull(timeEntries.deletedAt),
            filter.personId ? eq(timeEntries.personId, filter.personId) : undefined,
            filter.taskId ? eq(timeEntries.taskId, filter.taskId) : undefined,
            filter.from ? gte(timeEntries.workDate, filter.from) : undefined,
            filter.to ? lte(timeEntries.workDate, filter.to) : undefined,
          ),
        )
        .orderBy(desc(timeEntries.workDate), asc(timeEntries.createdAt));
      return rows as TimeEntryRow[];
    },
    async totalsByPersonDay(personIds, from, to) {
      if (personIds.length === 0) return [];
      return db
        .select({
          personId: timeEntries.personId,
          workDate: timeEntries.workDate,
          minutes: sql<number>`sum(${q(timeEntries.minutes)})::int`,
        })
        .from(timeEntries)
        .where(
          and(
            inArray(timeEntries.personId, [...personIds]),
            isNull(timeEntries.deletedAt),
            gte(timeEntries.workDate, from),
            lte(timeEntries.workDate, to),
          ),
        )
        .groupBy(timeEntries.personId, timeEntries.workDate);
    },
  };
}
