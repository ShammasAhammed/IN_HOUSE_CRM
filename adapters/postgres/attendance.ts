import { and, desc, eq, gte, inArray, isNull, lt, lte } from "drizzle-orm";
import { attendanceDays } from "@/db/schema";
import type { AttendanceRepository } from "@/repositories";
import type { Db } from "./connection";

const columns = {
  id: attendanceDays.id,
  personId: attendanceDays.personId,
  workDate: attendanceDays.workDate,
  location: attendanceDays.location,
  checkInAt: attendanceDays.checkInAt,
  checkOutAt: attendanceDays.checkOutAt,
  awayMinutes: attendanceDays.awayMinutes,
  latMilli: attendanceDays.latMilli,
  lngMilli: attendanceDays.lngMilli,
  note: attendanceDays.note,
  correctedById: attendanceDays.correctedById,
  correctionReason: attendanceDays.correctionReason,
};

export function attendanceRepository(db: Db): AttendanceRepository {
  return {
    async findDay(personId, workDate) {
      const [row] = await db
        .select(columns)
        .from(attendanceDays)
        .where(and(eq(attendanceDays.personId, personId), eq(attendanceDays.workDate, workDate), isNull(attendanceDays.deletedAt)))
        .limit(1);
      return row ?? null;
    },
    async list(filter) {
      if (filter.personIds && filter.personIds.length === 0) return [];
      return db
        .select(columns)
        .from(attendanceDays)
        .where(
          and(
            isNull(attendanceDays.deletedAt),
            gte(attendanceDays.workDate, filter.from),
            lte(attendanceDays.workDate, filter.to),
            filter.personIds ? inArray(attendanceDays.personId, [...filter.personIds]) : undefined,
          ),
        )
        .orderBy(attendanceDays.workDate);
    },
    async listOpen(personId, before, limit) {
      return db
        .select(columns)
        .from(attendanceDays)
        .where(and(eq(attendanceDays.personId, personId), lt(attendanceDays.workDate, before), isNull(attendanceDays.checkOutAt), isNull(attendanceDays.deletedAt)))
        .orderBy(desc(attendanceDays.workDate))
        .limit(limit);
    },
    async create(id, row) {
      await db.insert(attendanceDays).values({ id, ...row });
    },
    async update(id, patch) {
      await db.update(attendanceDays).set({ ...patch, updatedAt: new Date() }).where(eq(attendanceDays.id, id));
    },
  };
}
