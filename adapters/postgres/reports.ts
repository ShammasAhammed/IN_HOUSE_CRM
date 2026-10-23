import { and, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { clientReports, people } from "@/db/schema";
import type { ReportsRepository } from "@/repositories";
import type { Db } from "./connection";

export function reportsRepository(db: Db): ReportsRepository {
  const editable = (id: string, version: number) => and(eq(clientReports.id, id), eq(clientReports.version, version), eq(clientReports.status, "draft"));
  return {
    async find(clientId, month) {
      const author = alias(people, "report_author");
      const editor = alias(people, "report_editor");
      const finisher = alias(people, "report_finisher");
      const [r] = await db
        .select({
          id: clientReports.id,
          clientId: clientReports.clientId,
          month: clientReports.month,
          status: clientReports.status,
          facts: clientReports.facts,
          summary: clientReports.summary,
          wentWell: clientReports.wentWell,
          nextSteps: clientReports.nextSteps,
          version: clientReports.version,
          createdByName: author.fullName,
          updatedByName: editor.fullName,
          finalizedByName: finisher.fullName,
          finalizedAt: clientReports.finalizedAt,
          updatedAt: clientReports.updatedAt,
        })
        .from(clientReports)
        .innerJoin(author, eq(author.id, clientReports.createdById))
        .leftJoin(editor, eq(editor.id, clientReports.updatedById))
        .leftJoin(finisher, eq(finisher.id, clientReports.finalizedById))
        .where(and(eq(clientReports.clientId, clientId), eq(clientReports.month, month)))
        .limit(1);
      return r ?? null;
    },
    list: (clientId) => db.select({ month: clientReports.month, status: clientReports.status }).from(clientReports).where(eq(clientReports.clientId, clientId)).orderBy(desc(clientReports.month)),
    async create(row) {
      const r = await db.insert(clientReports).values(row).onConflictDoNothing().returning({ id: clientReports.id });
      return r.length > 0;
    },
    async update(id, version, patch, at) {
      const r = await db
        .update(clientReports)
        .set({ ...patch, updatedAt: at, version: sql`${clientReports.version} + 1` })
        .where(editable(id, version))
        .returning({ id: clientReports.id });
      return r.length > 0;
    },
    async finalize(id, version, byId, at) {
      const r = await db
        .update(clientReports)
        .set({ status: "final", finalizedById: byId, finalizedAt: at, updatedById: byId, updatedAt: at, version: sql`${clientReports.version} + 1` })
        .where(editable(id, version))
        .returning({ id: clientReports.id });
      return r.length > 0;
    },
  };
}
