// Engagements: the retainer or one-off job between a client and its projects (plan/3-projects-module.md, rule 1).
// Terms (fee, hours, dates) are set by people with engagements.write — the owner and the BDO who sells them (D66).
// Each retainer month gets a period that snapshots its budget and fee (D22–D24); periods are kept in step here.

import { addDays, addMonths, maxDate, startOfMonth, type IsoDate } from "@/lib/dates";
import { isId, newId } from "@/lib/id";
import { forbidden, invalid, notFound, ok, type Result } from "@/lib/result";
import type { EngagementKind, EngagementStatus, RolloverPolicy } from "@/lib/types";
import { parse } from "@/lib/validation/common";
import {
  addDeliverableSchema,
  changeFeeSchema,
  createEngagementSchema,
  removeDeliverableSchema,
  updateDeliverableSchema,
  updateEngagementSchema,
} from "@/lib/validation/engagements";
import type { DataStore, DeliverableRecord, EngagementRecord, FeeRow, NewEvent, Repositories, ServiceRecord } from "@/repositories";
import { change, commit, noChange } from "./change";
import type { Clock } from "./clock";
import { can, clientScope, type Actor } from "./permissions";
import { burn, periodTerms, rolloverMinutes, type Burn } from "./rules/retainer";

export type PeriodView = {
  periodStart: IsoDate;
  periodEnd: IsoDate;
  status: "open" | "closed";
  /** budget.read only. */
  hours?: { baseBudgetMinutes: number; rolloverInMinutes: number; usedMinutes: number; nonBillableMinutes: number; usedPercent: number };
  /** money.read only. */
  feePaise?: number;
};

export type EngagementPage = {
  engagement: {
    id: string;
    clientId: string;
    clientName: string;
    serviceId: string;
    serviceName: string;
    kind: EngagementKind;
    name: string;
    status: EngagementStatus;
    startDate: IsoDate;
    endDate: IsoDate | null;
    renewalDate: IsoDate | null;
    rolloverPolicy: RolloverPolicy;
    notes: string | null;
    /** budget.read or engagements.write. */
    hoursBudgetMinutes?: number;
    /** money.read: the fee in effect today. */
    feePaise?: number | null;
  };
  visible: { money: boolean; budget: boolean; write: boolean };
  /** budget.read: this month for a retainer, the whole job for a one-off. */
  burn?: (Burn & { nonBillableMinutes: number }) | null;
  /** money.read. */
  fees?: FeeRow[];
  periods: PeriodView[];
  deliverables: DeliverableRecord[];
  /** engagements.write: services to pick from when editing. */
  services?: ServiceRecord[];
};

const WRITE_DENIED = "Only the owner and the BDO change engagements.";

/** What a field change is called in the history. Values are left out: some are money (D14). */
const changedFields = <T extends object>(before: T, after: Partial<T>) =>
  (Object.keys(after) as Array<keyof T>).filter((k) => after[k] !== undefined && after[k] !== before[k]).map(String);

export function createEngagementService(deps: { store: DataStore; clock: Clock }) {
  const { store, clock } = deps;

  /** The engagement if the person may see its client. */
  async function visibleEngagement(repos: Repositories, actor: Actor, engagementId: string) {
    if (!isId(engagementId)) return null;
    const e = await repos.engagements.findById(engagementId);
    if (!e) return null;
    const client = await repos.clients.findById(e.clientId, clientScope(actor));
    return client ? { engagement: e, client } : null;
  }

  /**
   * Bring this month's period of a retainer in line with its terms: open it if the retainer is active and covers
   * the month, otherwise update its budget, rolled-in hours and fee when the terms changed. Earlier months are
   * history and stay as they were (D68). Returns the events to record.
   */
  async function syncPeriod(repos: Repositories, e: EngagementRecord, today: IsoDate, actorId: string | null): Promise<NewEvent[]> {
    if (e.kind !== "retainer") return [];
    const monthStart = startOfMonth(today);
    const existing = await repos.engagements.findPeriod(e.id, monthStart);
    if (existing?.status === "closed") return [];

    const fee = (await repos.engagements.feeOn(e.id, maxDate(monthStart, e.startDate))) ?? 0;
    const terms = periodTerms({
      engagementStart: e.startDate,
      engagementEnd: e.endDate,
      anyDateInMonth: monthStart,
      monthlyBudgetMinutes: e.hoursBudgetMinutes,
      monthlyFeePaise: fee,
    });
    const previous = await repos.engagements.findPeriod(e.id, startOfMonth(addDays(monthStart, -1)));
    const rolloverIn = previous ? rolloverMinutes({ policy: e.rolloverPolicy, monthlyBudgetMinutes: e.hoursBudgetMinutes, previous }) : 0;
    const base = { actorId, entityType: "engagement" as const, entityId: e.id, clientId: e.clientId };

    if (!existing) {
      // Draft, paused and ended retainers open no new months.
      if (!terms || e.status !== "active") return [];
      await repos.engagements.createPeriod(newId(), {
        engagementId: e.id,
        periodStart: terms.periodStart,
        periodEnd: terms.periodEnd,
        baseBudgetMinutes: terms.baseBudgetMinutes,
        rolloverInMinutes: rolloverIn,
        feePaise: terms.feePaise,
        status: "open",
      });
      return [{ ...base, action: "engagement.period_opened", data: { periodStart: terms.periodStart } }];
    }

    if (!terms) {
      // The dates moved so the retainer no longer covers this month.
      await repos.engagements.updatePeriod(existing.id, { deletedAt: clock.now() });
      return [{ ...base, action: "engagement.period_removed", data: { periodStart: existing.periodStart } }];
    }
    if (existing.baseBudgetMinutes === terms.baseBudgetMinutes && existing.rolloverInMinutes === rolloverIn && existing.feePaise === terms.feePaise) return [];
    await repos.engagements.updatePeriod(existing.id, { baseBudgetMinutes: terms.baseBudgetMinutes, rolloverInMinutes: rolloverIn, feePaise: terms.feePaise });
    return [{ ...base, action: "engagement.period_updated", data: { periodStart: existing.periodStart } }];
  }

  return {
    /** What the "new engagement" form needs. */
    async newForm(actor: Actor, clientId: string): Promise<Result<{ clientId: string; clientName: string; services: ServiceRecord[] }>> {
      if (!can(actor, "engagements.write")) return forbidden(WRITE_DENIED);
      if (!isId(clientId)) return notFound("That client");
      const client = await store.clients.findById(clientId, clientScope(actor));
      if (!client) return notFound("That client");
      return ok({ clientId: client.id, clientName: client.name, services: await store.catalog.listServices({ activeOnly: true }) });
    },

    async page(actor: Actor, engagementId: string): Promise<Result<EngagementPage>> {
      if (!can(actor, "engagements.read")) return forbidden("Engagements aren't part of your role.");
      const found = await visibleEngagement(store, actor, engagementId);
      if (!found) return notFound("That engagement");
      const { engagement: e, client } = found;
      const visible = { money: can(actor, "money.read"), budget: can(actor, "budget.read"), write: can(actor, "engagements.write") };
      const today = clock.today();

      const [fees, periods, deliverables, services, usage] = await Promise.all([
        visible.money ? store.engagements.listFees(e.id) : Promise.resolve(undefined),
        e.kind === "retainer" && (visible.money || visible.budget) ? store.engagements.listPeriods(e.id, { withUsage: visible.budget }) : Promise.resolve([]),
        store.engagements.listDeliverables(e.id),
        visible.write ? store.catalog.listServices({ activeOnly: false }) : Promise.resolve(undefined),
        e.kind === "one_off" && visible.budget ? store.engagements.totalUsage([e.id]) : Promise.resolve([]),
      ]);

      const page: EngagementPage = {
        engagement: {
          id: e.id,
          clientId: e.clientId,
          clientName: client.name,
          serviceId: e.serviceId,
          serviceName: e.serviceName,
          kind: e.kind,
          name: e.name,
          status: e.status,
          startDate: e.startDate,
          endDate: e.endDate,
          renewalDate: e.renewalDate,
          rolloverPolicy: e.rolloverPolicy,
          notes: e.notes,
        },
        visible,
        periods: periods.map((p) => {
          const view: PeriodView = { periodStart: p.periodStart, periodEnd: p.periodEnd, status: p.status };
          if (visible.budget) {
            const b = burn({ ...p, periodStart: p.coveredFrom, periodEnd: p.coveredTo, today });
            view.hours = {
              baseBudgetMinutes: p.baseBudgetMinutes,
              rolloverInMinutes: p.rolloverInMinutes,
              usedMinutes: p.usedMinutes,
              nonBillableMinutes: p.nonBillableMinutes,
              usedPercent: b.usedPercent,
            };
          }
          if (visible.money) view.feePaise = p.feePaise;
          return view;
        }),
        deliverables,
      };
      if (visible.budget || visible.write) page.engagement.hoursBudgetMinutes = e.hoursBudgetMinutes;
      if (visible.money && fees) {
        page.fees = fees;
        page.engagement.feePaise = await store.engagements.feeOn(e.id, today);
      }
      if (services) page.services = services;
      if (visible.budget) {
        if (e.kind === "retainer") {
          const current = periods.find((p) => p.periodStart <= today && p.periodEnd >= today);
          page.burn = current
            ? { ...burn({ ...current, periodStart: current.coveredFrom, periodEnd: current.coveredTo, today }), nonBillableMinutes: current.nonBillableMinutes }
            : null;
        } else {
          page.burn = oneOffBurn(e, usage[0], today);
        }
      }
      return ok(page);
    },

    async create(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "engagements.write")) return forbidden(WRITE_DENIED);
      const parsed = parse(createEngagementSchema, raw);
      if (!parsed.ok) return parsed;
      const input = parsed.value;
      const today = clock.today();
      return commit(store, async (repos) => {
        const client = await repos.clients.findById(input.clientId, clientScope(actor));
        if (!client) return notFound("That client");
        // Spaces (Oppllo's own work, its marketing included: 14.5) have no fees or retainers.
        if (client.isInternal) return invalid("Spaces have no fees or retainers.");
        const service = (await repos.catalog.listServices({ activeOnly: true })).find((s) => s.id === input.serviceId);
        if (!service) return invalid("Pick a service.", { serviceId: ["Pick a service."] });

        const retainer = input.kind === "retainer";
        const id = newId();
        const record: EngagementRecord = {
          id,
          clientId: client.id,
          serviceId: service.id,
          serviceName: service.name,
          kind: input.kind,
          name: input.name ?? (retainer ? `${service.name} retainer` : service.name),
          status: "active",
          startDate: input.startDate,
          endDate: input.endDate,
          // A retainer renews a year after it starts unless told otherwise (D67). One-off jobs don't renew.
          renewalDate: retainer ? (input.renewalDate ?? addMonths(input.startDate, 12)) : null,
          hoursBudgetMinutes: input.hoursBudget,
          rolloverPolicy: retainer ? input.rolloverPolicy : "expire",
          notes: input.notes,
        };
        const { id: _id, serviceName: _name, ...write } = record;
        await repos.engagements.create(id, write);
        await repos.engagements.addFee(newId(), { engagementId: id, amountPaise: input.fee, effectiveFrom: input.startDate, createdById: actor.personId });
        const periodEvents = await syncPeriod(repos, record, today, actor.personId);
        return change(
          { id },
          { actorId: actor.personId, action: "engagement.created", entityType: "engagement", entityId: id, clientId: client.id, data: { kind: input.kind, name: record.name } },
          ...periodEvents,
        );
      });
    },

    async update(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "engagements.write")) return forbidden(WRITE_DENIED);
      const parsed = parse(updateEngagementSchema, raw);
      if (!parsed.ok) return parsed;
      const input = parsed.value;
      const today = clock.today();
      return commit(store, async (repos) => {
        const found = await visibleEngagement(repos, actor, input.engagementId);
        if (!found) return notFound("That engagement");
        // Locked and read fresh, so a fee change or the daily job can't interleave with this edit.
        const before = (await repos.engagements.lockForUpdate(found.engagement.id))!;
        const service = (await repos.catalog.listServices({ activeOnly: false })).find((s) => s.id === input.serviceId);
        if (!service) return invalid("Pick a service.", { serviceId: ["Pick a service."] });
        if (before.kind === "retainer" && (input.startDate !== before.startDate || input.endDate !== before.endDate)) {
          // Closed months were billed on the old dates (D68): the start can't move, and the end can't cut into them.
          const closed = (await repos.engagements.listPeriods(before.id, { withUsage: false })).filter((p) => p.status === "closed");
          if (closed.length && input.startDate !== before.startDate) {
            return invalid("Months have already closed on this retainer, so its start date is fixed.", { startDate: ["Months have closed, so the start is fixed."] });
          }
          const lastClosed = closed.map((p) => p.periodEnd).sort().at(-1);
          if (lastClosed && input.endDate && input.endDate < lastClosed) {
            return invalid("Months up to then have already closed. Pick a later end.", { endDate: ["Pick a date after the last closed month."] });
          }
        }

        const retainer = before.kind === "retainer";
        const patch = {
          serviceId: service.id,
          name: input.name ?? before.name,
          status: input.status,
          startDate: input.startDate,
          endDate: input.endDate,
          renewalDate: retainer ? input.renewalDate : null,
          hoursBudgetMinutes: input.hoursBudget,
          rolloverPolicy: retainer ? input.rolloverPolicy : ("expire" as const),
          notes: input.notes,
        };
        const fields = changedFields(before, patch);
        if (fields.length === 0) return noChange({ id: before.id });
        await repos.engagements.update(before.id, patch);
        // The first fee was agreed from the start date; it moves with it.
        if (input.startDate !== before.startDate) {
          const fees = await repos.engagements.listFees(before.id);
          const first = fees.at(-1);
          if (first && first.effectiveFrom === before.startDate && (fees.length === 1 || input.startDate < fees.at(-2)!.effectiveFrom)) {
            await repos.engagements.removeFeesFrom(before.id, first.effectiveFrom);
            await repos.engagements.addFee(newId(), { engagementId: before.id, amountPaise: first.amountPaise, effectiveFrom: input.startDate, createdById: actor.personId });
          }
        }
        const after: EngagementRecord = { ...before, ...patch, serviceName: service.name };
        const events: NewEvent[] = [
          { actorId: actor.personId, action: "engagement.updated", entityType: "engagement", entityId: before.id, clientId: before.clientId, data: { fields } },
        ];
        if (before.status !== patch.status) {
          events.push({ actorId: actor.personId, action: "engagement.status_changed", entityType: "engagement", entityId: before.id, clientId: before.clientId, data: { from: before.status, to: patch.status } });
        }
        events.push(...(await syncPeriod(repos, after, today, actor.personId)));
        return change({ id: before.id }, ...(events as [NewEvent, ...NewEvent[]]));
      });
    },

    /**
     * A new fee (D28, D66). Retainers: from the first of a month, this month or later — months already under way
     * before it keep their fee. One-off jobs have one total fee; a change corrects it.
     */
    async changeFee(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "engagements.write") || !can(actor, "money.read")) return forbidden(WRITE_DENIED);
      const parsed = parse(changeFeeSchema, raw);
      if (!parsed.ok) return parsed;
      const input = parsed.value;
      const today = clock.today();
      return commit(store, async (repos) => {
        const found = await visibleEngagement(repos, actor, input.engagementId);
        if (!found) return notFound("That engagement");
        // Locked so two fee changes for the same month can't both land.
        const e = (await repos.engagements.lockForUpdate(found.engagement.id))!;
        let from: IsoDate;
        if (e.kind === "retainer") {
          if (!input.effectiveMonth) return invalid("Pick the month the new fee starts.", { effectiveMonth: ["Pick a month."] });
          if (input.effectiveMonth < startOfMonth(today)) {
            return invalid("Earlier months are closed. Pick this month or a later one.", { effectiveMonth: ["Pick this month or later."] });
          }
          if (e.endDate && input.effectiveMonth > e.endDate) return invalid("The engagement ends before that month.", { effectiveMonth: ["The engagement ends before then."] });
          from = maxDate(input.effectiveMonth, e.startDate);
        } else {
          from = e.startDate;
        }
        const previous = await repos.engagements.feeOn(e.id, from);
        const fees = await repos.engagements.listFees(e.id);
        const sameDay = fees.find((f) => f.effectiveFrom === from);
        if (sameDay && sameDay.amountPaise === input.amount) return noChange({ id: e.id });
        // A second change for the same start replaces the first.
        if (sameDay) await repos.engagements.removeFeesFrom(e.id, from);
        await repos.engagements.addFee(newId(), { engagementId: e.id, amountPaise: input.amount, effectiveFrom: from, createdById: actor.personId });
        const periodEvents = await syncPeriod(repos, e, today, actor.personId);
        return change(
          { id: e.id },
          {
            actorId: actor.personId,
            action: "engagement.fee_changed",
            entityType: "engagement",
            entityId: e.id,
            clientId: e.clientId,
            data: { amountPaise: input.amount, previousPaise: previous, effectiveFrom: from },
          },
          ...periodEvents,
        );
      });
    },

    async addDeliverable(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "engagements.write")) return forbidden(WRITE_DENIED);
      const parsed = parse(addDeliverableSchema, raw);
      if (!parsed.ok) return parsed;
      return commit(store, async (repos) => {
        const found = await visibleEngagement(repos, actor, parsed.value.engagementId);
        if (!found) return notFound("That engagement");
        const id = newId();
        await repos.engagements.createDeliverable(id, { engagementId: found.engagement.id, name: parsed.value.name, targetCount: parsed.value.targetCount });
        return change(
          { id },
          { actorId: actor.personId, action: "deliverable.created", entityType: "deliverable", entityId: id, clientId: found.engagement.clientId, data: { name: parsed.value.name, targetCount: parsed.value.targetCount } },
        );
      });
    },

    async updateDeliverable(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "engagements.write")) return forbidden(WRITE_DENIED);
      const parsed = parse(updateDeliverableSchema, raw);
      if (!parsed.ok) return parsed;
      return commit(store, async (repos) => {
        const found = await findDeliverable(repos, actor, parsed.value.deliverableId);
        if (!found) return notFound("That deliverable");
        const { deliverable: d, engagement } = found;
        if (d.name === parsed.value.name && d.targetCount === parsed.value.targetCount) return noChange({ id: d.id });
        await repos.engagements.updateDeliverable(d.id, { name: parsed.value.name, targetCount: parsed.value.targetCount });
        return change(
          { id: d.id },
          { actorId: actor.personId, action: "deliverable.updated", entityType: "deliverable", entityId: d.id, clientId: engagement.clientId, data: { name: parsed.value.name, from: d.targetCount, to: parsed.value.targetCount } },
        );
      });
    },

    async removeDeliverable(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "engagements.write")) return forbidden(WRITE_DENIED);
      const parsed = parse(removeDeliverableSchema, raw);
      if (!parsed.ok) return parsed;
      return commit(store, async (repos) => {
        const found = await findDeliverable(repos, actor, parsed.value.deliverableId);
        if (!found) return notFound("That deliverable");
        await repos.engagements.updateDeliverable(found.deliverable.id, { deletedAt: clock.now() });
        return change(
          { id: found.deliverable.id },
          { actorId: actor.personId, action: "deliverable.removed", entityType: "deliverable", entityId: found.deliverable.id, clientId: found.engagement.clientId, data: { name: found.deliverable.name } },
        );
      });
    },

    /**
     * The daily job (system, no actor): close months that ended, open this month for every active retainer and
     * keep open months in line with their terms. Safe to run any number of times.
     */
    async runDaily(): Promise<{ closed: number; opened: number; updated: number; errors: unknown[] }> {
      const today = clock.today();
      const errors: unknown[] = [];
      let closed = 0;
      try {
        const r = await commit(store, async (repos) => {
          const rows = await repos.engagements.closeEndedPeriods(today);
          const events = rows.map((p): NewEvent => ({ actorId: null, action: "engagement.period_closed", entityType: "engagement", entityId: p.engagementId, clientId: p.clientId, data: { periodStart: p.periodStart } }));
          return events.length ? change(rows.length, ...(events as [NewEvent, ...NewEvent[]])) : noChange(0);
        });
        if (r.ok) closed = r.value;
      } catch (err) {
        errors.push(err);
      }
      let opened = 0;
      let updated = 0;
      // One retainer failing doesn't stop the rest; the job reports what failed.
      for (const listed of await store.engagements.listActiveRetainers()) {
        try {
          const r = await commit(store, async (repos) => {
            // Read fresh under a lock: an edit made since the list was read wins.
            const e = await repos.engagements.lockForUpdate(listed.id);
            const events = e && e.kind === "retainer" && e.status === "active" ? await syncPeriod(repos, e, today, null) : [];
            return events.length ? change(events, ...(events as [NewEvent, ...NewEvent[]])) : noChange([] as NewEvent[]);
          });
          if (!r.ok) continue;
          for (const ev of r.value) {
            if (ev.action === "engagement.period_opened") opened++;
            else updated++;
          }
        } catch (err) {
          errors.push(err);
        }
      }
      return { closed, opened, updated, errors };
    },
  };

  async function findDeliverable(repos: Repositories, actor: Actor, deliverableId: string) {
    if (!isId(deliverableId)) return null;
    // Deliverables are few per engagement; find through the engagements the person can see.
    const engagementId = await repos.engagements.deliverableEngagement(deliverableId);
    if (!engagementId) return null;
    const found = await visibleEngagement(repos, actor, engagementId);
    if (!found) return null;
    const deliverable = (await repos.engagements.listDeliverables(engagementId)).find((d) => d.id === deliverableId);
    return deliverable ? { deliverable, engagement: found.engagement } : null;
  }
}

/** A one-off job burns against its whole budget, from its start to its end (D27). */
export function oneOffBurn(
  e: Pick<EngagementRecord, "hoursBudgetMinutes" | "startDate" | "endDate">,
  usage: { usedMinutes: number; nonBillableMinutes: number } | undefined,
  today: IsoDate,
): (Burn & { nonBillableMinutes: number }) | null {
  if (e.hoursBudgetMinutes === 0) return null;
  const end = e.endDate && e.endDate >= e.startDate ? e.endDate : maxDate(today, e.startDate);
  return {
    ...burn({ baseBudgetMinutes: e.hoursBudgetMinutes, rolloverInMinutes: 0, usedMinutes: usage?.usedMinutes ?? 0, periodStart: e.startDate, periodEnd: end, today }),
    nonBillableMinutes: usage?.nonBillableMinutes ?? 0,
  };
}

export type EngagementService = ReturnType<typeof createEngagementService>;
