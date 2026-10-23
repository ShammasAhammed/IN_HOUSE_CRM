import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { departments, holidays, leaveGrants, leaveQuotas, leaveRequests, leaveTypes, people, settings } from "@/db/schema";
import type { CalendarRepository, LeaveRepository, LeaveRequestRecord, LeaveTypeRecord } from "@/repositories";
import { newId } from "@/lib/id";
import type { EmploymentType } from "@/lib/types";
import type { Db } from "./connection";

const approver = alias(people, "approver");

export function leaveRepository(db: Db): LeaveRepository {
  async function types(where?: ReturnType<typeof eq>): Promise<LeaveTypeRecord[]> {
    const rows = await db
      .select()
      .from(leaveTypes)
      .where(and(isNull(leaveTypes.deletedAt), where))
      .orderBy(asc(leaveTypes.position));
    if (rows.length === 0) return [];
    const quotas = await db
      .select()
      .from(leaveQuotas)
      .where(and(inArray(leaveQuotas.leaveTypeId, rows.map((r) => r.id)), isNull(leaveQuotas.deletedAt)));
    return rows.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      usesBalance: r.usesBalance,
      grantedOnly: r.grantedOnly,
      grantExpiryDays: r.grantExpiryDays,
      allowHalfDay: r.allowHalfDay,
      maxBackdateDays: r.maxBackdateDays,
      active: r.active,
      quotas: Object.fromEntries(quotas.filter((q) => q.leaveTypeId === r.id).map((q) => [q.employmentType, q.halfDaysPerYear])),
    }));
  }

  const requestColumns = {
    id: leaveRequests.id,
    personId: leaveRequests.personId,
    personName: people.fullName,
    departmentId: people.departmentId,
    departmentName: departments.name,
    leaveTypeId: leaveRequests.leaveTypeId,
    leaveTypeName: leaveTypes.name,
    startDate: leaveRequests.startDate,
    endDate: leaveRequests.endDate,
    halfDay: leaveRequests.halfDay,
    reason: leaveRequests.reason,
    status: leaveRequests.status,
    approverId: leaveRequests.approverId,
    approverName: approver.fullName,
    decidedById: leaveRequests.decidedById,
    decidedAt: leaveRequests.decidedAt,
    decisionNote: leaveRequests.decisionNote,
    cancelledFrom: leaveRequests.cancelledFrom,
    cancelRequestedFrom: leaveRequests.cancelRequestedFrom,
    createdById: leaveRequests.createdById,
    createdAt: leaveRequests.createdAt,
  };

  const requests = () =>
    db
      .select(requestColumns)
      .from(leaveRequests)
      .innerJoin(people, eq(people.id, leaveRequests.personId))
      .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
      .leftJoin(departments, eq(departments.id, people.departmentId))
      .leftJoin(approver, eq(approver.id, leaveRequests.approverId));

  return {
    listTypes: () => types(),
    async createType(row) {
      await db.insert(leaveTypes).values(row);
    },
    async findType(id) {
      return (await types(eq(leaveTypes.id, id)))[0] ?? null;
    },
    async updateType(id, patch) {
      await db.update(leaveTypes).set({ ...patch, updatedAt: new Date() }).where(eq(leaveTypes.id, id));
    },
    async setQuota(leaveTypeId, employmentType: EmploymentType, halfDaysPerYear) {
      const [existing] = await db
        .select({ id: leaveQuotas.id })
        .from(leaveQuotas)
        .where(and(eq(leaveQuotas.leaveTypeId, leaveTypeId), eq(leaveQuotas.employmentType, employmentType), isNull(leaveQuotas.deletedAt)));
      if (existing) {
        await db.update(leaveQuotas).set({ halfDaysPerYear, updatedAt: new Date() }).where(eq(leaveQuotas.id, existing.id));
      } else {
        await db.insert(leaveQuotas).values({ id: newId(), leaveTypeId, employmentType, halfDaysPerYear });
      }
    },

    async listRequests(filter) {
      const rows = await requests()
        .where(
          and(
            isNull(leaveRequests.deletedAt),
            filter.personIds ? (filter.personIds.length ? inArray(leaveRequests.personId, [...filter.personIds]) : sql`false`) : undefined,
            filter.approverId ? eq(leaveRequests.approverId, filter.approverId) : undefined,
            filter.statuses ? inArray(leaveRequests.status, [...filter.statuses]) : undefined,
            filter.leaveTypeId ? eq(leaveRequests.leaveTypeId, filter.leaveTypeId) : undefined,
            filter.overlapping ? lte(leaveRequests.startDate, filter.overlapping.to) : undefined,
            filter.overlapping ? gte(leaveRequests.endDate, filter.overlapping.from) : undefined,
            filter.withCancelRequest ? isNotNull(leaveRequests.cancelRequestedFrom) : undefined,
          ),
        )
        .orderBy(asc(leaveRequests.startDate), asc(people.fullName));
      return rows as LeaveRequestRecord[];
    },
    async findRequest(id) {
      const [row] = await requests().where(and(eq(leaveRequests.id, id), isNull(leaveRequests.deletedAt))).limit(1);
      return (row as LeaveRequestRecord | undefined) ?? null;
    },
    async createRequest(id, request) {
      await db.insert(leaveRequests).values({ id, ...request });
    },
    async updateRequest(id, patch) {
      await db.update(leaveRequests).set({ ...patch, updatedAt: new Date() }).where(eq(leaveRequests.id, id));
    },
    async updateRequestIf(id, expected, patch) {
      const rows = await db
        .update(leaveRequests)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(eq(leaveRequests.id, id), eq(leaveRequests.status, expected)))
        .returning({ id: leaveRequests.id });
      return rows.length === 1;
    },

    async listGrants(personIds) {
      if (personIds.length === 0) return [];
      return db
        .select({
          id: leaveGrants.id,
          personId: leaveGrants.personId,
          leaveTypeId: leaveGrants.leaveTypeId,
          halfDays: leaveGrants.halfDays,
          grantedOn: leaveGrants.grantedOn,
          expiresOn: leaveGrants.expiresOn,
          reason: leaveGrants.reason,
        })
        .from(leaveGrants)
        .where(and(inArray(leaveGrants.personId, [...personIds]), isNull(leaveGrants.deletedAt)))
        .orderBy(asc(leaveGrants.grantedOn));
    },
    async createGrant(id, grant) {
      await db.insert(leaveGrants).values({ id, ...grant });
    },
  };
}

export function calendarRepository(db: Db): CalendarRepository {
  return {
    async listHolidays(from, to) {
      return db
        .select({ id: holidays.id, date: holidays.date, name: holidays.name })
        .from(holidays)
        .where(and(isNull(holidays.deletedAt), gte(holidays.date, from), lte(holidays.date, to)))
        .orderBy(asc(holidays.date));
    },
    async findHolidayOn(date) {
      const [row] = await db
        .select({ id: holidays.id, date: holidays.date, name: holidays.name })
        .from(holidays)
        .where(and(isNull(holidays.deletedAt), eq(holidays.date, date)));
      return row ?? null;
    },
    async addHoliday(id, date, name) {
      await db.insert(holidays).values({ id, date, name });
    },
    async removeHoliday(id) {
      const [row] = await db
        .update(holidays)
        .set({ deletedAt: new Date() })
        .where(and(eq(holidays.id, id), isNull(holidays.deletedAt)))
        .returning({ id: holidays.id, date: holidays.date, name: holidays.name });
      return row ?? null;
    },
    async getSetting<T>(key: string) {
      const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, key));
      return row ? (row.value as T) : null;
    },
    async setSetting(key, value, updatedById) {
      await db
        .insert(settings)
        .values({ key, value, updatedById })
        .onConflictDoUpdate({ target: settings.key, set: { value, updatedById, updatedAt: new Date() } });
    },
  };
}
