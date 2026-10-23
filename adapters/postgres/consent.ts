import { and, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { consentRecords, people } from "@/db/schema";
import type { ConsentCounts, ConsentRecord, ConsentRepository } from "@/repositories";
import type { Db } from "./connection";

export function consentRepository(db: Db): ConsentRepository {
  function rows(where: SQL): Promise<ConsentRecord[]> {
    const recorder = alias(people, "consent_recorder");
    const withdrawer = alias(people, "consent_withdrawer");
    return db
      .select({
        id: consentRecords.id,
        subjectType: consentRecords.subjectType,
        subjectId: consentRecords.subjectId,
        purpose: consentRecords.purpose,
        method: consentRecords.method,
        givenAt: consentRecords.givenAt,
        note: consentRecords.note,
        recordedByName: recorder.fullName,
        withdrawnAt: consentRecords.withdrawnAt,
        withdrawnMethod: consentRecords.withdrawnMethod,
        withdrawnNote: consentRecords.withdrawnNote,
        withdrawnByName: withdrawer.fullName,
      })
      .from(consentRecords)
      .leftJoin(recorder, eq(recorder.id, consentRecords.recordedById))
      .leftJoin(withdrawer, eq(withdrawer.id, consentRecords.withdrawnById))
      .where(where)
      .orderBy(desc(consentRecords.givenAt));
  }
  return {
    list: (subjectType, subjectId) => rows(and(eq(consentRecords.subjectType, subjectType), eq(consentRecords.subjectId, subjectId))!),
    async find(id) {
      const [r] = await rows(eq(consentRecords.id, id));
      return r ?? null;
    },
    async add(row) {
      await db.insert(consentRecords).values(row);
    },
    async withdraw(id, w, at) {
      const r = await db
        .update(consentRecords)
        .set({ withdrawnAt: at, withdrawnMethod: w.method, withdrawnNote: w.note, withdrawnById: w.byId })
        .where(and(eq(consentRecords.id, id), isNull(consentRecords.withdrawnAt)))
        .returning({ id: consentRecords.id });
      return r.length > 0;
    },
    async counts() {
      const out: ConsentCounts = { lead: { active: 0, withdrawn: 0 }, person: { active: 0, withdrawn: 0 }, client_contact: { active: 0, withdrawn: 0 } };
      const r = await db
        .select({ subjectType: consentRecords.subjectType, withdrawn: sql<boolean>`${consentRecords.withdrawnAt} is not null`, n: sql<number>`count(*)::int` })
        .from(consentRecords)
        .groupBy(consentRecords.subjectType, sql`${consentRecords.withdrawnAt} is not null`);
      for (const x of r) out[x.subjectType][x.withdrawn ? "withdrawn" : "active"] = x.n;
      return out;
    },
  };
}
