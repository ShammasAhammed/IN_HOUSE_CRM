import { and, count, desc, eq, gte, isNull, lt, max, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { internRecords, letters, oneToOnes, people } from "@/db/schema";
import type { TalentRepository } from "@/repositories";
import type { Db } from "./connection";

export function talentRepository(db: Db): TalentRepository {
  const mentor = alias(people, "intern_mentor");
  const reviewer = alias(people, "intern_reviewer");
  const records = () =>
    db
      .select({
        id: internRecords.id,
        personId: internRecords.personId,
        batch: internRecords.batch,
        mentorId: internRecords.mentorId,
        mentorName: mentor.fullName,
        plannedEndDate: internRecords.plannedEndDate,
        focus: internRecords.focus,
        strengths: internRecords.strengths,
        workedOn: internRecords.workedOn,
        hireAgain: internRecords.hireAgain,
        reviewNotes: internRecords.reviewNotes,
        reviewedByName: reviewer.fullName,
        reviewedAt: internRecords.reviewedAt,
        inTalentPool: internRecords.inTalentPool,
      })
      .from(internRecords)
      .leftJoin(mentor, eq(mentor.id, internRecords.mentorId))
      .leftJoin(reviewer, eq(reviewer.id, internRecords.reviewedById));
  const lead = alias(people, "one_to_one_lead");
  const issuer = alias(people, "letter_issuer");
  const letterRows = () =>
    db
      .select({
        id: letters.id,
        personId: letters.personId,
        personName: people.fullName,
        kind: letters.kind,
        refNo: letters.refNo,
        title: letters.title,
        body: letters.body,
        issuedOn: letters.issuedOn,
        issuedByName: issuer.fullName,
        createdAt: letters.createdAt,
      })
      .from(letters)
      .innerJoin(people, eq(people.id, letters.personId))
      .leftJoin(issuer, eq(issuer.id, letters.issuedById));
  return {
    async internRecords() {
      return records().where(isNull(internRecords.deletedAt)).orderBy(desc(internRecords.createdAt));
    },
    async internRecord(personId) {
      const [row] = await records().where(and(eq(internRecords.personId, personId), isNull(internRecords.deletedAt))).limit(1);
      return row ?? null;
    },
    async createInternRecord(row) {
      await db.insert(internRecords).values(row);
    },
    async updateInternRecord(personId, patch) {
      await db.update(internRecords).set({ ...patch, updatedAt: new Date() }).where(and(eq(internRecords.personId, personId), isNull(internRecords.deletedAt)));
    },
    async oneToOnes(personId) {
      return db
        .select({ id: oneToOnes.id, personId: oneToOnes.personId, leadId: oneToOnes.leadId, leadName: lead.fullName, meetingDate: oneToOnes.meetingDate, discussed: oneToOnes.discussed, agreed: oneToOnes.agreed, createdAt: oneToOnes.createdAt })
        .from(oneToOnes)
        .innerJoin(lead, eq(lead.id, oneToOnes.leadId))
        .where(and(eq(oneToOnes.personId, personId), isNull(oneToOnes.deletedAt)))
        .orderBy(desc(oneToOnes.meetingDate), desc(oneToOnes.createdAt));
    },
    async lastOneToOnes() {
      const rows = await db.select({ personId: oneToOnes.personId, meetingDate: max(oneToOnes.meetingDate) }).from(oneToOnes).where(isNull(oneToOnes.deletedAt)).groupBy(oneToOnes.personId);
      return rows.filter((r) => r.meetingDate).map((r) => ({ personId: r.personId, meetingDate: r.meetingDate! }));
    },
    async findOneToOne(id) {
      const [row] = await db
        .select({ id: oneToOnes.id, personId: oneToOnes.personId, leadId: oneToOnes.leadId, leadName: lead.fullName, meetingDate: oneToOnes.meetingDate, discussed: oneToOnes.discussed, agreed: oneToOnes.agreed, createdAt: oneToOnes.createdAt })
        .from(oneToOnes)
        .innerJoin(lead, eq(lead.id, oneToOnes.leadId))
        .where(and(eq(oneToOnes.id, id), isNull(oneToOnes.deletedAt)))
        .limit(1);
      return row ?? null;
    },
    async addOneToOne(row) {
      await db.insert(oneToOnes).values(row);
    },
    async removeOneToOne(id, at) {
      await db.update(oneToOnes).set({ deletedAt: at }).where(eq(oneToOnes.id, id));
    },
    async letters(personId) {
      return letterRows()
        .where(and(isNull(letters.deletedAt), personId ? eq(letters.personId, personId) : undefined))
        .orderBy(desc(letters.issuedOn), desc(letters.createdAt));
    },
    async findLetter(id) {
      const [row] = await letterRows().where(and(eq(letters.id, id), isNull(letters.deletedAt))).limit(1);
      return row ?? null;
    },
    async lockLetterNumbers(year) {
      await db.execute(sql`select pg_advisory_xact_lock(${7_100_000 + year})`);
    },
    async countLetters(year) {
      const [r] = await db
        .select({ n: count() })
        .from(letters)
        .where(and(gte(letters.issuedOn, `${year}-01-01`), lt(letters.issuedOn, `${year + 1}-01-01`)));
      return Number(r?.n ?? 0);
    },
    async addLetter(row) {
      await db.insert(letters).values(row);
    },
    async removeLetter(id, at) {
      await db.update(letters).set({ deletedAt: at }).where(eq(letters.id, id));
    },
  };
}
