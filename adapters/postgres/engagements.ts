import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { clients, deliverables, engagementFees, engagementPeriods, engagements, people, services, tasks, timeEntries } from "@/db/schema";
import type { EngagementsRepository } from "@/repositories";
import type { Db } from "./connection";
import { q } from "./sql";

/**
 * The fee in effect on a date: the latest one effective on or before it. Before the first one takes effect
 * (a job that hasn't started yet), the earliest one — the fee agreed for the start.
 */
const feeOrder = (on: string) =>
  sql`(${q(engagementFees.effectiveFrom)} <= ${on}) desc,
    case when ${q(engagementFees.effectiveFrom)} <= ${on} then ${q(engagementFees.effectiveFrom)} end desc nulls last,
    ${q(engagementFees.effectiveFrom)} asc, ${q(engagementFees.createdAt)} desc`;

const record = {
  id: engagements.id,
  clientId: engagements.clientId,
  serviceId: engagements.serviceId,
  serviceName: services.name,
  kind: engagements.kind,
  name: engagements.name,
  status: engagements.status,
  startDate: engagements.startDate,
  endDate: engagements.endDate,
  renewalDate: engagements.renewalDate,
  hoursBudgetMinutes: engagements.hoursBudgetMinutes,
  rolloverPolicy: engagements.rolloverPolicy,
  notes: engagements.notes,
};

export function engagementsRepository(db: Db): EngagementsRepository {
  /** Periods with what was used inside each. A join, not a correlated subquery. All time counts towards burn (D26). */
  const periodsQuery = () =>
    db
      .select({
        id: engagementPeriods.id,
        engagementId: engagementPeriods.engagementId,
        periodStart: engagementPeriods.periodStart,
        periodEnd: engagementPeriods.periodEnd,
        coveredFrom: sql<string>`greatest(${q(engagementPeriods.periodStart)}, ${q(engagements.startDate)})`,
        coveredTo: sql<string>`least(${q(engagementPeriods.periodEnd)}, coalesce(${q(engagements.endDate)}, ${q(engagementPeriods.periodEnd)}))`,
        baseBudgetMinutes: engagementPeriods.baseBudgetMinutes,
        rolloverInMinutes: engagementPeriods.rolloverInMinutes,
        feePaise: engagementPeriods.feePaise,
        status: engagementPeriods.status,
        usedMinutes: sql<number>`coalesce(sum(${q(timeEntries.minutes)}), 0)::int`,
        nonBillableMinutes: sql<number>`coalesce(sum(${q(timeEntries.minutes)}) filter (where not ${q(timeEntries.billable)}), 0)::int`,
      })
      .from(engagementPeriods)
      .innerJoin(engagements, eq(engagements.id, engagementPeriods.engagementId))
      .leftJoin(
        timeEntries,
        and(
          eq(timeEntries.engagementId, engagementPeriods.engagementId),
          isNull(timeEntries.deletedAt),
          sql`${q(timeEntries.workDate)} between ${q(engagementPeriods.periodStart)} and ${q(engagementPeriods.periodEnd)}`,
        ),
      )
      .$dynamic();

  return {
    async findById(id) {
      const [row] = await db
        .select(record)
        .from(engagements)
        .innerJoin(services, eq(services.id, engagements.serviceId))
        .where(and(eq(engagements.id, id), isNull(engagements.deletedAt)))
        .limit(1);
      return row ?? null;
    },

    async lockForUpdate(id) {
      await db.execute(sql`select 1 from ${engagements} where ${q(engagements.id)} = ${id} for update`);
      const [row] = await db
        .select(record)
        .from(engagements)
        .innerJoin(services, eq(services.id, engagements.serviceId))
        .where(and(eq(engagements.id, id), isNull(engagements.deletedAt)))
        .limit(1);
      return row ?? null;
    },

    async listActiveRetainers() {
      return db
        .select(record)
        .from(engagements)
        .innerJoin(services, eq(services.id, engagements.serviceId))
        .innerJoin(clients, eq(clients.id, engagements.clientId))
        .where(and(eq(engagements.kind, "retainer"), eq(engagements.status, "active"), isNull(engagements.deletedAt), isNull(clients.deletedAt)));
    },

    async create(id, e) {
      await db.insert(engagements).values({ id, ...e });
    },

    async update(id, patch) {
      await db.update(engagements).set({ ...patch, updatedAt: new Date() }).where(eq(engagements.id, id));
    },

    async listFees(engagementId) {
      return db
        .select({
          id: engagementFees.id,
          amountPaise: engagementFees.amountPaise,
          effectiveFrom: engagementFees.effectiveFrom,
          createdByName: people.fullName,
          createdAt: engagementFees.createdAt,
        })
        .from(engagementFees)
        .leftJoin(people, eq(people.id, engagementFees.createdById))
        .where(and(eq(engagementFees.engagementId, engagementId), isNull(engagementFees.deletedAt)))
        .orderBy(desc(engagementFees.effectiveFrom), desc(engagementFees.createdAt));
    },

    async feeOn(engagementId, on) {
      const [row] = await db
        .select({ amountPaise: engagementFees.amountPaise })
        .from(engagementFees)
        .where(and(eq(engagementFees.engagementId, engagementId), isNull(engagementFees.deletedAt)))
        .orderBy(feeOrder(on))
        .limit(1);
      return row?.amountPaise ?? null;
    },

    async addFee(id, fee) {
      await db.insert(engagementFees).values({ id, ...fee });
    },

    async removeFeesFrom(engagementId, effectiveFrom) {
      await db
        .update(engagementFees)
        .set({ deletedAt: new Date() })
        .where(and(eq(engagementFees.engagementId, engagementId), eq(engagementFees.effectiveFrom, effectiveFrom), isNull(engagementFees.deletedAt)));
    },

    async listPeriods(engagementId, opts = { withUsage: true }) {
      if (!opts.withUsage) {
        // Fees only: time logged isn't read at all.
        const rows = await db
          .select({
            id: engagementPeriods.id,
            engagementId: engagementPeriods.engagementId,
            periodStart: engagementPeriods.periodStart,
            periodEnd: engagementPeriods.periodEnd,
            coveredFrom: sql<string>`greatest(${q(engagementPeriods.periodStart)}, ${q(engagements.startDate)})`,
            coveredTo: sql<string>`least(${q(engagementPeriods.periodEnd)}, coalesce(${q(engagements.endDate)}, ${q(engagementPeriods.periodEnd)}))`,
            baseBudgetMinutes: engagementPeriods.baseBudgetMinutes,
            rolloverInMinutes: engagementPeriods.rolloverInMinutes,
            feePaise: engagementPeriods.feePaise,
            status: engagementPeriods.status,
          })
          .from(engagementPeriods)
          .innerJoin(engagements, eq(engagements.id, engagementPeriods.engagementId))
          .where(and(eq(engagementPeriods.engagementId, engagementId), isNull(engagementPeriods.deletedAt)))
          .orderBy(desc(engagementPeriods.periodStart));
        return rows.map((r) => ({ ...r, usedMinutes: 0, nonBillableMinutes: 0 }));
      }
      return periodsQuery()
        .where(and(eq(engagementPeriods.engagementId, engagementId), isNull(engagementPeriods.deletedAt)))
        .groupBy(engagementPeriods.id, engagements.id)
        .orderBy(desc(engagementPeriods.periodStart));
    },

    async findPeriod(engagementId, periodStart) {
      const [row] = await periodsQuery()
        .where(and(eq(engagementPeriods.engagementId, engagementId), eq(engagementPeriods.periodStart, periodStart), isNull(engagementPeriods.deletedAt)))
        .groupBy(engagementPeriods.id, engagements.id)
        .limit(1);
      return row ?? null;
    },

    async createPeriod(id, period) {
      await db.insert(engagementPeriods).values({ id, ...period });
    },

    async updatePeriod(id, patch) {
      await db.update(engagementPeriods).set({ ...patch, updatedAt: new Date() }).where(eq(engagementPeriods.id, id));
    },

    async closeEndedPeriods(today) {
      const rows = await db
        .update(engagementPeriods)
        .set({ status: "closed", updatedAt: new Date() })
        .where(and(eq(engagementPeriods.status, "open"), lt(engagementPeriods.periodEnd, today), isNull(engagementPeriods.deletedAt)))
        .returning({ id: engagementPeriods.id, engagementId: engagementPeriods.engagementId, periodStart: engagementPeriods.periodStart });
      if (rows.length === 0) return [];
      const owners = await db
        .select({ id: engagements.id, clientId: engagements.clientId })
        .from(engagements)
        .where(inArray(engagements.id, [...new Set(rows.map((r) => r.engagementId))]));
      return rows.map((r) => ({ ...r, clientId: owners.find((o) => o.id === r.engagementId)!.clientId }));
    },

    async totalUsage(engagementIds) {
      if (engagementIds.length === 0) return [];
      return db
        .select({
          engagementId: timeEntries.engagementId,
          usedMinutes: sql<number>`coalesce(sum(${q(timeEntries.minutes)}), 0)::int`,
          nonBillableMinutes: sql<number>`coalesce(sum(${q(timeEntries.minutes)}) filter (where not ${q(timeEntries.billable)}), 0)::int`,
        })
        .from(timeEntries)
        .where(and(inArray(timeEntries.engagementId, [...engagementIds]), isNull(timeEntries.deletedAt)))
        .groupBy(timeEntries.engagementId)
        .then((rows) => rows.map((r) => ({ ...r, engagementId: r.engagementId! })));
    },

    async listDeliverables(engagementId) {
      return db
        .select({ id: deliverables.id, engagementId: deliverables.engagementId, name: deliverables.name, targetCount: deliverables.targetCount })
        .from(deliverables)
        .where(and(eq(deliverables.engagementId, engagementId), isNull(deliverables.deletedAt)))
        .orderBy(asc(deliverables.createdAt));
    },

    async deliverableEngagement(deliverableId) {
      const [row] = await db
        .select({ engagementId: deliverables.engagementId })
        .from(deliverables)
        .where(and(eq(deliverables.id, deliverableId), isNull(deliverables.deletedAt)))
        .limit(1);
      return row?.engagementId ?? null;
    },

    async createDeliverable(id, d) {
      await db.insert(deliverables).values({ id, ...d });
    },

    async updateDeliverable(id, patch) {
      await db.update(deliverables).set({ ...patch, updatedAt: new Date() }).where(eq(deliverables.id, id));
    },

    async listForClients(clientIds, opts) {
      if (clientIds.length === 0) return [];
      // Restricted columns are not even selected unless asked for.
      const fee = opts.includeFees
        ? sql<number | null>`(select ${q(engagementFees.amountPaise)} from ${engagementFees}
            where ${q(engagementFees.engagementId)} = ${q(engagements.id)} and ${q(engagementFees.deletedAt)} is null
            order by ${feeOrder(opts.on)} limit 1)`.mapWith((v: unknown) => (v === null ? null : Number(v)))
        : sql<null>`null`;
      const budget = opts.includeBudgets ? sql<number>`${q(engagements.hoursBudgetMinutes)}` : sql<null>`null`;
      return db
        .select({
          id: engagements.id,
          clientId: engagements.clientId,
          name: engagements.name,
          serviceId: engagements.serviceId,
          serviceName: services.name,
          kind: engagements.kind,
          status: engagements.status,
          startDate: engagements.startDate,
          endDate: engagements.endDate,
          renewalDate: engagements.renewalDate,
          rolloverPolicy: engagements.rolloverPolicy,
          hoursBudgetMinutes: budget,
          currentFeePaise: fee,
        })
        .from(engagements)
        .innerJoin(services, eq(services.id, engagements.serviceId))
        .where(
          and(
            inArray(engagements.clientId, [...clientIds]),
            isNull(engagements.deletedAt),
            opts.activeOnly ? eq(engagements.status, "active") : undefined,
          ),
        )
        .orderBy(asc(services.position), asc(engagements.startDate));
    },

    async periodsOn(engagementIds, on) {
      if (engagementIds.length === 0) return [];
      return periodsQuery()
        .where(
          and(
            inArray(engagementPeriods.engagementId, [...engagementIds]),
            lte(engagementPeriods.periodStart, on),
            gte(engagementPeriods.periodEnd, on),
            isNull(engagementPeriods.deletedAt),
          ),
        )
        .groupBy(engagementPeriods.id, engagements.id);
    },

    async deliverablesProgress(engagementIds, from, to) {
      if (engagementIds.length === 0) return [];
      // Delivered = linked top-level tasks completed in the range (India dates).
      return db
        .select({
          id: deliverables.id,
          engagementId: deliverables.engagementId,
          name: deliverables.name,
          targetCount: deliverables.targetCount,
          delivered: sql<number>`count(${q(tasks.id)})::int`,
        })
        .from(deliverables)
        .leftJoin(
          tasks,
          and(
            eq(tasks.deliverableId, deliverables.id),
            isNull(tasks.deletedAt),
            isNull(tasks.parentTaskId),
            eq(tasks.status, "done"),
            sql`(${q(tasks.completedAt)} at time zone 'Asia/Kolkata')::date between ${from} and ${to}`,
          ),
        )
        .where(and(inArray(deliverables.engagementId, [...engagementIds]), isNull(deliverables.deletedAt)))
        .groupBy(deliverables.id);
    },
  };
}
