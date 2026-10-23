import { and, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { notifications, people } from "@/db/schema";
import type { NotificationsRepository } from "@/repositories";
import type { Db } from "./connection";

const columns = {
  id: notifications.id,
  kind: notifications.kind,
  title: notifications.title,
  body: notifications.body,
  link: notifications.link,
  readAt: notifications.readAt,
  createdAt: notifications.createdAt,
};

export function notificationsRepository(db: Db): NotificationsRepository {
  return {
    async create(rows) {
      if (rows.length) await db.insert(notifications).values(rows).onConflictDoNothing();
    },
    async list(personId, limit) {
      return db.select(columns).from(notifications).where(eq(notifications.personId, personId)).orderBy(desc(notifications.createdAt), desc(notifications.id)).limit(limit);
    },
    async countUnread(personId, kinds) {
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(notifications)
        .where(and(eq(notifications.personId, personId), isNull(notifications.readAt), kinds ? inArray(notifications.kind, [...kinds]) : undefined));
      return row?.n ?? 0;
    },
    async markRead(personId, ids, at) {
      await db
        .update(notifications)
        .set({ readAt: at })
        .where(and(eq(notifications.personId, personId), isNull(notifications.readAt), ids === "all" ? undefined : inArray(notifications.id, [...ids])));
    },
    async pendingEmail(limit) {
      return db
        .select({ ...columns, personId: notifications.personId, email: people.workEmail, fullName: people.fullName })
        .from(notifications)
        .innerJoin(people, eq(people.id, notifications.personId))
        .where(and(isNull(notifications.readAt), isNull(notifications.emailedAt), eq(people.status, "active"), lte(notifications.createdAt, new Date())))
        .orderBy(notifications.personId, notifications.createdAt)
        .limit(limit);
    },
    async markEmailed(ids, at) {
      if (ids.length) await db.update(notifications).set({ emailedAt: at }).where(inArray(notifications.id, [...ids]));
    },
  };
}
