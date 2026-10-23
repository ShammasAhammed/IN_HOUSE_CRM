// Leave: balances, applying, approving, cancelling, the team calendar, holidays and HR settings.
// Business rules: plan/4-hr-module.md and decisions D39–D49. Pure maths lives in rules/leave.ts.

import { addDays, diffDays, eachDay, endOfMonth, isIsoDate, maxDate, minDate, startOfMonth, yearOf, type IsoDate } from "@/lib/dates";
import { z } from "zod";
import { isId, newId, settingId } from "@/lib/id";
import { conflict, forbidden, invalid, notFound, ok, type Failure, type Result } from "@/lib/result";
import type { HalfDay, LeaveStatus } from "@/lib/types";
import { parse } from "@/lib/validation/common";
import { workWeekSchema } from "@/lib/validation/catalog";
import { applyLeaveSchema, decisionSchema, grantSchema, holidaySchema, leaveTypeSchema, quotaSchema, revokeSchema } from "@/lib/validation/leave";
import type { DataStore, LeaveGrantRecord, LeaveRequestRecord, LeaveTypeRecord, PersonRecord, Repositories } from "@/repositories";
import { change, commit, noChange } from "./change";
import type { Clock } from "./clock";
import { can, type Actor } from "./permissions";
import {
  approverFor,
  cancelOutcome,
  daysLabel,
  effectiveEnd,
  halfDaysByYear,
  halfDaysIn,
  leaveBalance,
  overlaps,
  type Calendar,
  type LeaveBalance,
  type LeaveOnRecord,
} from "./rules/leave";
import { DEFAULT_WORK_WEEK, type WorkWeek } from "./rules/working-days";
import { countOf } from "@/lib/format";

const MAX_SPAN_DAYS = 62;
const ACTIVE: LeaveStatus[] = ["pending", "approved"];

export type BalanceView = LeaveBalance & {
  leaveTypeId: string;
  key: string;
  name: string;
  usesBalance: boolean;
  grantedOnly: boolean;
  allowHalfDay: boolean;
};

/** A leave request as one viewer may see it. Type and reason are hidden from people who shouldn't see them (D18). */
export type LeaveView = {
  id: string;
  personId: string;
  personName: string;
  departmentName: string | null;
  startDate: IsoDate;
  endDate: IsoDate;
  effectiveEnd: IsoDate | null;
  halfDay: HalfDay | null;
  halfDays: number;
  status: LeaveStatus;
  approverName: string | null;
  decisionNote: string | null;
  cancelRequestedFrom: IsoDate | null;
  /** Null when the viewer may not see what kind of leave it is. */
  leaveTypeName: string | null;
  reason: string | null;
  createdAt: Date;
  /** What the viewer can do with it. */
  canCancel: boolean;
};

export type CancelResult = "cancelled" | "cut_short_requested" | "cut_short";

export type Clash = { personName: string; startDate: IsoDate; endDate: IsoDate; status: LeaveStatus };

export type Preview = {
  halfDays: number;
  byYear: Array<{ year: number; halfDays: number; availableBefore: number | null; availableAfter: number | null }>;
  clashes: Clash[];
  /** Why it can't be submitted as it stands, if it can't. */
  problem: string | null;
};

export type ApprovalItem = {
  kind: "leave" | "cut_short";
  request: LeaveView;
  /** The requester's balance of this type after approval (this year). Null for unpaid. */
  availableAfter: number | null;
  clashes: Clash[];
};

export type CalendarMonth = {
  month: string;
  days: IsoDate[];
  workingDays: IsoDate[];
  holidays: Array<{ date: IsoDate; name: string }>;
  rows: Array<{
    personId: string;
    personName: string;
    departmentName: string | null;
    days: Record<IsoDate, { status: LeaveStatus; halfDay: HalfDay | null; typeName: string | null }>;
  }>;
};

export function createLeaveService(deps: { store: DataStore; clock: Clock }) {
  const { store, clock } = deps;

  // ---------- helpers ----------

  async function calendarFor(repos: Repositories, from: IsoDate, to: IsoDate): Promise<Calendar> {
    const [week, holidays] = await Promise.all([
      repos.calendar.getSetting<WorkWeek>("work_week"),
      repos.calendar.listHolidays(from, to),
    ]);
    return { week: week ?? DEFAULT_WORK_WEEK, holidays: new Set(holidays.map((h) => h.date)) };
  }

  const yearSpan = (year: number) => ({ from: `${year}-01-01`, to: `${year}-12-31` });

  type OwnedLeave = LeaveOnRecord & { personId: string; leaveTypeId: string };

  function balanceFor(
    person: PersonRecord,
    type: LeaveTypeRecord,
    year: number,
    requests: readonly OwnedLeave[],
    grants: LeaveGrantRecord[],
    calendar: Calendar,
  ): LeaveBalance {
    return leaveBalance({
      year,
      today: clock.today(),
      type,
      quotaHalfDays: type.quotas[person.employmentType] ?? 0,
      joinDate: person.joinDate,
      grants: grants.filter((g) => g.leaveTypeId === type.id && g.personId === person.id),
      requests: requests.filter((r) => r.leaveTypeId === type.id && r.personId === person.id),
      calendar,
    });
  }

  /** May this viewer see the type and reason of this person's leave? (D18) */
  function seesDetail(viewer: Actor, r: Pick<LeaveRequestRecord, "personId" | "approverId">) {
    return viewer.personId === r.personId || viewer.personId === r.approverId || can(viewer, "leave.read.all");
  }

  function view(viewer: Actor, r: LeaveRequestRecord, calendar: Calendar): LeaveView {
    const detail = seesDetail(viewer, r);
    const today = clock.today();
    const outcome = cancelOutcome(r, today);
    return {
      id: r.id,
      personId: r.personId,
      personName: r.personName,
      departmentName: r.departmentName,
      startDate: r.startDate,
      endDate: r.endDate,
      effectiveEnd: effectiveEnd(r),
      halfDay: r.halfDay,
      halfDays: halfDaysIn(r, calendar),
      status: r.status,
      approverName: r.approverName,
      decisionNote: detail ? r.decisionNote : null,
      cancelRequestedFrom: r.cancelRequestedFrom,
      leaveTypeName: detail ? r.leaveTypeName : null,
      reason: detail ? r.reason : null,
      createdAt: r.createdAt,
      canCancel: viewer.personId === r.personId && outcome.kind !== "not_allowed" && !r.cancelRequestedFrom,
    };
  }

  async function clashesFor(repos: Repositories, person: PersonRecord, span: { startDate: IsoDate; endDate: IsoDate }, excludeId?: string) {
    if (!person.departmentId) return [];
    const others = await repos.leave.listRequests({ statuses: ACTIVE, overlapping: { from: span.startDate, to: span.endDate } });
    return others
      .filter((o) => o.id !== excludeId && o.personId !== person.id && o.departmentId === person.departmentId)
      .filter((o) => overlaps(o, { ...span, halfDay: null, cancelledFrom: null }))
      .map((o): Clash => ({ personName: o.personName, startDate: o.startDate, endDate: effectiveEnd(o) ?? o.endDate, status: o.status }));
  }

  type Assessed = {
    ok: true;
    input: ReturnType<typeof applyLeaveSchema.parse>;
    person: PersonRecord;
    type: LeaveTypeRecord;
    forOther: boolean;
    preview: Preview;
  };

  /** Everything needed to judge one request against one person's balances. */
  async function assess(repos: Repositories, actor: Actor, raw: unknown): Promise<Failure | Assessed> {
    const parsed = parse(applyLeaveSchema, raw);
    if (!parsed.ok) return parsed;
    const input = parsed.value;
    const today = clock.today();

    const forOther = Boolean(input.forPersonId && input.forPersonId !== actor.personId);
    if (forOther && !can(actor, "leave.manage") && !can(actor, "leave.approve.any")) {
      return forbidden("Only HR or the owner can record leave for someone else.");
    }
    const person = await repos.people.findById(forOther ? input.forPersonId! : actor.personId);
    if (!person || person.status !== "active") return notFound("That person");
    if (person.employmentType === "freelancer") return invalid("Freelancers don't take leave through Oppllo One.");

    const type = await repos.leave.findType(input.leaveTypeId);
    if (!type || !type.active) return invalid("Pick a leave type.", { leaveTypeId: ["Pick a leave type."] });
    if (input.halfDay && !type.allowHalfDay) return invalid(`${type.name} can't be taken as a half day.`, { halfDay: ["Not for this leave type."] });
    const lastBookable = `${yearOf(today) + 1}-12-31`;
    if (input.endDate > lastBookable) {
      return invalid("Leave can be booked up to the end of next year, once its holidays are published.", { endDate: ["Too far ahead."] });
    }
    if (diffDays(input.startDate, input.endDate) + 1 > MAX_SPAN_DAYS) {
      return invalid("That's longer than two months. Talk to HR about a long leave.", { endDate: ["Too long."] });
    }
    if (!forOther) {
      const earliest = addDays(today, -type.maxBackdateDays);
      if (input.startDate < earliest) {
        const message =
          type.maxBackdateDays === 0
            ? `${type.name} can't be applied for past days. Ask HR to record it.`
            : `${type.name} can be applied for up to ${countOf(type.maxBackdateDays, "day")} back. Ask HR to record older leave.`;
        return invalid(message, { startDate: [message] });
      }
    }

    const span = { startDate: input.startDate, endDate: input.endDate, halfDay: input.halfDay, cancelledFrom: null };
    const years = [yearOf(input.startDate), yearOf(input.endDate)];
    const calendar = await calendarFor(repos, `${Math.min(...years)}-01-01`, `${Math.max(...years)}-12-31`);
    const byYear = halfDaysByYear(span, calendar);
    const total = [...byYear.values()].reduce((a, b) => a + b, 0);

    const [requests, grants, clashes] = await Promise.all([
      repos.leave.listRequests({ personIds: [person.id], statuses: ACTIVE }),
      repos.leave.listGrants([person.id]),
      clashesFor(repos, person, input),
    ]);

    let problem: string | null = null;
    if (total === 0) problem = "Those days are already off (weekend or holiday).";
    const double = requests.find((r) => overlaps(r, span));
    if (!problem && double) problem = `There's already leave from ${double.startDate} to ${double.endDate} on those dates.`;

    const hypothetical: OwnedLeave = { ...span, personId: person.id, leaveTypeId: type.id, status: "pending" };
    const rows: Preview["byYear"] = [];
    for (const [year, halfDays] of [...byYear.entries()].sort((a, b) => a[0] - b[0])) {
      const before = balanceFor(person, type, year, requests, grants, calendar).availableHalfDays;
      const after = balanceFor(person, type, year, [...requests, hypothetical], grants, calendar).availableHalfDays;
      rows.push({ year, halfDays, availableBefore: before, availableAfter: after });
      // For comp-off a use may find no grant valid on its date; then the balance drops by less than requested.
      if (!problem && type.usesBalance && before !== null && after !== null && (after < 0 || before - after < halfDays)) {
        problem = type.grantedOnly
          ? `Not enough comp-off valid on those dates: you have ${daysLabel(before)}${before > 0 ? ", and it may expire before then" : ""}.`
          : `You have ${daysLabel(Math.max(0, before))} of ${type.name.toLowerCase()} left in ${year}; this needs ${daysLabel(halfDays)}.`;
      }
    }
    return { ok: true, input, person, type, forOther, preview: { halfDays: total, byYear: rows, clashes, problem } };
  }

  async function loadForDecision(repos: Repositories, actor: Actor, requestId: string) {
    const first = await repos.leave.findRequest(requestId);
    if (!first) return { ok: false as const, failure: notFound("That leave request") };
    // Lock the requester, then re-read: a decision made meanwhile is seen, not overwritten.
    await repos.people.lockForUpdate(first.personId);
    const request = (await repos.leave.findRequest(requestId))!;
    const allowed = request.approverId === actor.personId || can(actor, "leave.approve.any");
    if (!allowed || (request.personId === actor.personId && !actor.roles.includes("owner"))) {
      return { ok: false as const, failure: forbidden("Only the person's approver or the owner can decide this.") };
    }
    return { ok: true as const, request };
  }

  // ---------- public ----------

  return {
    /** The person's own leave page: balances for the year, their requests, and what waits on them. */
    async myOverview(actor: Actor, year = yearOf(clock.today())): Promise<
      Result<{ year: number; balances: BalanceView[]; requests: LeaveView[]; waitingOnMe: number; canApply: boolean }>
    > {
      const person = await store.people.findById(actor.personId);
      if (!person) return notFound("Your profile");
      const [types, requests, grants, calendar, waiting] = await Promise.all([
        store.leave.listTypes(),
        store.leave.listRequests({ personIds: [person.id] }),
        store.leave.listGrants([person.id]),
        calendarFor(store, `${year - 1}-01-01`, `${year + 1}-12-31`),
        store.leave.listRequests({ approverId: person.id, statuses: ["pending"] }),
      ]);
      const cutShort = await store.leave.listRequests({ approverId: person.id, statuses: ["approved"], withCancelRequest: true });
      const active = requests.filter((r) => ACTIVE.includes(r.status));
      const balances = types
        .filter((t) => t.active)
        .map((t) => ({
          leaveTypeId: t.id,
          key: t.key,
          name: t.name,
          usesBalance: t.usesBalance,
          grantedOnly: t.grantedOnly,
          allowHalfDay: t.allowHalfDay,
          ...balanceFor(person, t, year, active, grants, calendar),
        }));
      const range = yearSpan(year);
      const mine = requests
        .filter((r) => r.endDate >= range.from && r.startDate <= range.to)
        .map((r) => view(actor, r, calendar))
        .sort((a, b) => b.startDate.localeCompare(a.startDate));
      return ok({
        year,
        balances,
        requests: mine,
        waitingOnMe: waiting.filter((w) => w.personId !== person.id).length + cutShort.length,
        canApply: person.employmentType !== "freelancer",
      });
    },

    /** Balances for any person: themselves, HR or the owner. */
    async balancesFor(actor: Actor, personId: string, year = yearOf(clock.today())): Promise<Result<BalanceView[]>> {
      if (personId !== actor.personId && !can(actor, "leave.read.all")) return forbidden("Only HR and the owner can see other people's balances.");
      const person = await store.people.findById(personId);
      if (!person) return notFound("That person");
      const [types, requests, grants, calendar] = await Promise.all([
        store.leave.listTypes(),
        store.leave.listRequests({ personIds: [personId], statuses: ACTIVE }),
        store.leave.listGrants([personId]),
        calendarFor(store, `${year - 1}-01-01`, `${year + 1}-12-31`),
      ]);
      return ok(
        types
          .filter((t) => t.active)
          .map((t) => ({
            leaveTypeId: t.id,
            key: t.key,
            name: t.name,
            usesBalance: t.usesBalance,
            grantedOnly: t.grantedOnly,
            allowHalfDay: t.allowHalfDay,
            ...balanceFor(person, t, year, requests, grants, calendar),
          })),
      );
    },

    /** What a request would do, before it's sent: days, balance after, clashes, and any problem. */
    async preview(actor: Actor, raw: unknown): Promise<Result<Preview>> {
      const a = await assess(store, actor, raw);
      return a.ok ? ok(a.preview) : a;
    },

    async apply(actor: Actor, raw: unknown): Promise<Result<{ request: LeaveView; clashes: Clash[]; approved: boolean }>> {
      return commit(store, async (repos) => {
        // Lock the person first: concurrent requests for them queue up, so a balance can't be spent twice.
        const forPersonId = raw && typeof raw === "object" && "forPersonId" in raw ? (raw as { forPersonId?: unknown }).forPersonId : null;
        const lockId = typeof forPersonId === "string" && forPersonId ? forPersonId : actor.personId;
        if (isId(lockId)) await repos.people.lockForUpdate(lockId);
        const a = await assess(repos, actor, raw);
        if (!a.ok) return a;
        if (a.preview.problem) return conflict(a.preview.problem);

        const people = await repos.people.listActive();
        const route = approverFor({
          requester: { id: a.person.id, roles: a.person.roles, reportsToId: a.person.reportsToId },
          activePeopleIds: new Set(people.map((p) => p.id)),
          ownerIds: people.filter((p) => p.roles.includes("owner")).map((p) => p.id),
        });
        // Approved straight away: the owner's own leave; the owner recording anyone's leave; HR recording leave that
        // has already happened (a fact, D47). HR recording future leave still goes to the approver (D42).
        const recordedPast = a.forOther && a.input.endDate < clock.today();
        const approved = route.autoApprove || (a.forOther && (actor.roles.includes("owner") || recordedPast));
        const id = newId();
        const now = clock.now();
        await repos.leave.createRequest(id, {
          personId: a.person.id,
          leaveTypeId: a.type.id,
          startDate: a.input.startDate,
          endDate: a.input.endDate,
          halfDay: a.input.halfDay,
          reason: a.input.reason,
          status: approved ? "approved" : "pending",
          approverId: route.approverId,
          decidedById: approved ? actor.personId : null,
          decidedAt: approved ? now : null,
          createdById: actor.personId,
        });
        const request = (await repos.leave.findRequest(id))!;
        const calendar = await calendarFor(repos, a.input.startDate, a.input.endDate);
        const data = { type: a.type.key, startDate: a.input.startDate, endDate: a.input.endDate, halfDays: a.preview.halfDays };
        const requested = { actorId: actor.personId, action: "leave.requested", entityType: "leave_request" as const, entityId: id, personId: a.person.id, data };
        const result = { request: view(actor, request, calendar), clashes: a.preview.clashes, approved };
        return approved
          ? change(result, requested, { ...requested, action: a.forOther ? "leave.recorded" : "leave.approved" })
          : change(result, requested);
      });
    },

    /** Approved leave this person approves (or, for the owner, anyone's) that hasn't started: can still be revoked. */
    async myApprovedUpcoming(actor: Actor): Promise<Result<LeaveView[]>> {
      const today = clock.today();
      const requests = await store.leave.listRequests({
        statuses: ["approved"],
        overlapping: { from: addDays(today, 1), to: addDays(today, 365) },
        ...(can(actor, "leave.approve.any") ? {} : { approverId: actor.personId }),
      });
      const upcoming = requests.filter((r) => r.startDate > today && r.personId !== actor.personId);
      if (upcoming.length === 0) return ok([]);
      const calendar = await calendarFor(store, today, addDays(today, 400));
      return ok(upcoming.map((r) => view(actor, r, calendar)));
    },

    /** How many requests wait on this person's decision (for the tab badge). */
    async waitingOnMeCount(actor: Actor): Promise<number> {
      const seesAll = can(actor, "leave.approve.any");
      const [pending, cutShort, active] = await Promise.all([
        store.leave.listRequests({ statuses: ["pending"], ...(seesAll ? {} : { approverId: actor.personId }) }),
        store.leave.listRequests({ statuses: ["approved"], withCancelRequest: true, ...(seesAll ? {} : { approverId: actor.personId }) }),
        seesAll ? store.people.listActive() : Promise.resolve([]),
      ]);
      const activeIds = new Set(active.map((p) => p.id));
      // The owner also answers for requests whose approver is gone.
      return [...pending, ...cutShort].filter(
        (r) => r.personId !== actor.personId && (r.approverId === actor.personId || (seesAll && (!r.approverId || !activeIds.has(r.approverId)))),
      ).length;
    },

    /** Does this person approve anyone's leave? (Shows the Approvals tab even when nothing is waiting.) */
    async isApprover(actor: Actor): Promise<boolean> {
      if (can(actor, "leave.approve.any")) return true;
      const people = await store.people.listActive();
      return people.some((p) => p.reportsToId === actor.personId);
    },

    /** Requests waiting on this person: new leave, and requests to cut started leave short. */
    async approvals(actor: Actor): Promise<Result<{ mine: ApprovalItem[]; others: ApprovalItem[] }>> {
      const seesAll = can(actor, "leave.approve.any");
      const [pending, cutShort] = await Promise.all([
        store.leave.listRequests({ statuses: ["pending"], ...(seesAll ? {} : { approverId: actor.personId }) }),
        store.leave.listRequests({ statuses: ["approved"], withCancelRequest: true, ...(seesAll ? {} : { approverId: actor.personId }) }),
      ]);
      const all = [...pending, ...cutShort].filter((r) => r.personId !== actor.personId);
      if (all.length === 0) return ok({ mine: [], others: [] });

      const personIds = [...new Set(all.map((r) => r.personId))];
      const year = yearOf(clock.today());
      const [types, people, requests, grants, calendar] = await Promise.all([
        store.leave.listTypes(),
        store.people.listAll(),
        store.leave.listRequests({ personIds, statuses: ACTIVE }),
        store.leave.listGrants(personIds),
        calendarFor(store, `${year - 1}-01-01`, `${year + 1}-12-31`),
      ]);

      const items = await Promise.all(
        all.map(async (r): Promise<ApprovalItem> => {
          const person = people.find((p) => p.id === r.personId);
          const type = types.find((t) => t.id === r.leaveTypeId)!;
          const balance = person ? balanceFor(person, type, yearOf(r.startDate), requests, grants, calendar) : null;
          return {
            kind: r.status === "pending" ? "leave" : "cut_short",
            request: view(actor, r, calendar),
            availableAfter: balance?.availableHalfDays ?? null,
            clashes: person ? await clashesFor(store, person, r, r.id) : [],
          };
        }),
      );
      const byDate = (a: ApprovalItem, b: ApprovalItem) => a.request.startDate.localeCompare(b.request.startDate);
      const isMine = (i: ApprovalItem) => all.find((r) => r.id === i.request.id)!.approverId === actor.personId;
      return ok({ mine: items.filter(isMine).sort(byDate), others: items.filter((i) => !isMine(i)).sort(byDate) });
    },

    async decide(actor: Actor, raw: unknown, approve: boolean): Promise<Result<LeaveView>> {
      const parsed = parse(decisionSchema, raw);
      if (!parsed.ok) return parsed;
      return commit(store, async (repos) => {
        const loaded = await loadForDecision(repos, actor, parsed.value.requestId);
        if (!loaded.ok) return loaded.failure;
        const r = loaded.request;
        if (r.status !== "pending") return conflict(`This request is already ${r.status}.`);

        if (approve) {
          // Quotas may have changed since it was asked for: re-check before approving.
          const person = (await repos.people.findById(r.personId))!;
          const type = (await repos.leave.findType(r.leaveTypeId))!;
          const calendar = await calendarFor(repos, `${yearOf(r.startDate)}-01-01`, `${yearOf(r.endDate)}-12-31`);
          const [requests, grants] = await Promise.all([
            repos.leave.listRequests({ personIds: [person.id], statuses: ACTIVE }),
            repos.leave.listGrants([person.id]),
          ]);
          for (const year of halfDaysByYear(r, calendar).keys()) {
            const after = balanceFor(person, type, year, requests, grants, calendar).availableHalfDays;
            if (after !== null && after < 0) return conflict(`Approving this would take ${person.fullName}'s ${type.name.toLowerCase()} below zero.`);
          }
        }
        const done = await repos.leave.updateRequestIf(r.id, "pending", {
          status: approve ? "approved" : "rejected",
          decidedById: actor.personId,
          decidedAt: clock.now(),
          decisionNote: parsed.value.note,
        });
        if (!done) return conflict("Someone else just decided this request.");
        const updated = (await repos.leave.findRequest(r.id))!;
        const calendar = await calendarFor(repos, r.startDate, r.endDate);
        return change(view(actor, updated, calendar), {
          actorId: actor.personId,
          action: approve ? "leave.approved" : "leave.rejected",
          entityType: "leave_request",
          entityId: r.id,
          personId: r.personId,
          data: { note: parsed.value.note },
        });
      });
    },

    /** The person cancels their own leave (D43). Started leave becomes a request to cut it short. */
    async cancel(actor: Actor, requestId: string): Promise<Result<{ outcome: CancelResult }>> {
      return commit<{ outcome: CancelResult }>(store, async (repos) => {
        if (!isId(requestId)) return notFound("That leave request");
        await repos.people.lockForUpdate(actor.personId);
        const r = await repos.leave.findRequest(requestId);
        if (!r || r.personId !== actor.personId) return notFound("That leave request");
        if (r.cancelRequestedFrom) return conflict("You've already asked to cut this leave short.");
        const outcome = cancelOutcome(r, clock.today());
        const event = { actorId: actor.personId, entityType: "leave_request" as const, entityId: r.id, personId: r.personId };
        switch (outcome.kind) {
          case "not_allowed":
            return conflict(outcome.message);
          case "cancel":
            if (!(await repos.leave.updateRequestIf(r.id, r.status, { status: "cancelled" }))) return conflict("This request just changed. Refresh and try again.");
            return change<{ outcome: CancelResult }>({ outcome: "cancelled" }, { ...event, action: "leave.cancelled" });
          case "request_cut_short":
            if (actor.roles.includes("owner")) {
              await repos.leave.updateRequest(r.id, { cancelledFrom: outcome.from });
              return change<{ outcome: CancelResult }>({ outcome: "cut_short" }, { ...event, action: "leave.cut_short", data: { from: outcome.from } });
            }
            await repos.leave.updateRequest(r.id, { cancelRequestedFrom: outcome.from });
            return change<{ outcome: CancelResult }>({ outcome: "cut_short_requested" }, { ...event, action: "leave.cut_short_requested", data: { from: outcome.from } });
        }
      });
    },

    async decideCutShort(actor: Actor, raw: unknown, approve: boolean): Promise<Result<LeaveView>> {
      const parsed = parse(decisionSchema, raw);
      if (!parsed.ok) return parsed;
      return commit(store, async (repos) => {
        const loaded = await loadForDecision(repos, actor, parsed.value.requestId);
        if (!loaded.ok) return loaded.failure;
        const r = loaded.request;
        if (r.status !== "approved" || !r.cancelRequestedFrom) return conflict("There's no request to cut this leave short.");
        await repos.leave.updateRequest(r.id, {
          cancelledFrom: approve ? r.cancelRequestedFrom : r.cancelledFrom,
          cancelRequestedFrom: null,
          // Cut short before it started counting at all = cancelled.
          ...(approve && r.cancelRequestedFrom <= r.startDate ? { status: "cancelled" as const } : {}),
        });
        const updated = (await repos.leave.findRequest(r.id))!;
        const calendar = await calendarFor(repos, r.startDate, r.endDate);
        return change(view(actor, updated, calendar), {
          actorId: actor.personId,
          action: approve ? "leave.cut_short" : "leave.cut_short_declined",
          entityType: "leave_request",
          entityId: r.id,
          personId: r.personId,
          data: { from: r.cancelRequestedFrom, note: parsed.value.note },
        });
      });
    },

    /** The approver or owner withdraws approved leave that hasn't started, with a reason (D43). */
    async revoke(actor: Actor, raw: unknown): Promise<Result<LeaveView>> {
      const parsed = parse(revokeSchema, raw);
      if (!parsed.ok) return parsed;
      return commit(store, async (repos) => {
        const loaded = await loadForDecision(repos, actor, parsed.value.requestId);
        if (!loaded.ok) return loaded.failure;
        const r = loaded.request;
        if (r.status !== "approved") return conflict("Only approved leave can be revoked.");
        if (r.startDate <= clock.today()) return conflict("This leave has started. Ask the person to cut it short instead.");
        if (!(await repos.leave.updateRequestIf(r.id, "approved", { status: "revoked", decidedById: actor.personId, decidedAt: clock.now(), decisionNote: parsed.value.note }))) {
          return conflict("This request just changed. Refresh and try again.");
        }
        const updated = (await repos.leave.findRequest(r.id))!;
        const calendar = await calendarFor(repos, r.startDate, r.endDate);
        return change(view(actor, updated, calendar), {
          actorId: actor.personId,
          action: "leave.revoked",
          entityType: "leave_request",
          entityId: r.id,
          personId: r.personId,
          data: { reason: parsed.value.note },
        });
      });
    },

    /** Who is off, month by month. Everyone sees approved leave; type only where allowed (D18). */
    async teamCalendar(actor: Actor, month: string): Promise<Result<CalendarMonth>> {
      const first = `${month}-01`;
      if (!/^\d{4}-\d{2}$/.test(month) || !isIsoDate(first)) return invalid("Pick a month.");
      const from = startOfMonth(first);
      const to = endOfMonth(first);
      const [people, requests, calendar, holidays] = await Promise.all([
        store.people.listActive(),
        store.leave.listRequests({ statuses: ACTIVE, overlapping: { from, to } }),
        calendarFor(store, from, to),
        store.calendar.listHolidays(from, to),
      ]);
      const days = eachDay(from, to);
      const rows = people
        .filter((p) => p.employmentType !== "freelancer")
        .map((p) => {
          const entries: CalendarMonth["rows"][number]["days"] = {};
          for (const r of requests.filter((x) => x.personId === p.id)) {
            // Pending leave shows only to people who would decide or manage it.
            if (r.status === "pending" && !seesDetail(actor, r)) continue;
            const detail = seesDetail(actor, r);
            const end = effectiveEnd(r);
            if (!end) continue;
            for (const d of eachDay(maxDate(r.startDate, from), minDate(end, to))) {
              if (!calendar.holidays.has(d)) entries[d] = { status: r.status, halfDay: r.halfDay, typeName: detail ? r.leaveTypeName : null };
            }
          }
          return { personId: p.id, personName: p.fullName, departmentName: p.departmentName, days: entries };
        })
        .sort((a, b) => (a.departmentName ?? "").localeCompare(b.departmentName ?? "") || a.personName.localeCompare(b.personName));
      const working = days.filter((d) => halfDaysIn({ startDate: d, endDate: d, halfDay: null, cancelledFrom: null }, calendar) > 0);
      return ok({ month, days, workingDays: working, holidays: holidays.map(({ date, name }) => ({ date, name })), rows });
    },

    /** Who is off on given days (for My Day, presence and the dashboard). Visible to everyone, without types. */
    async offOn(actor: Actor, from: IsoDate, to: IsoDate): Promise<Result<Array<{ personId: string; personName: string; startDate: IsoDate; endDate: IsoDate; halfDay: HalfDay | null }>>> {
      const requests = await store.leave.listRequests({ statuses: ["approved"], overlapping: { from, to } });
      return ok(
        requests
          .filter((r) => {
            const end = effectiveEnd(r);
            return end !== null && end >= from;
          })
          .map((r) => ({ personId: r.personId, personName: r.personName, startDate: r.startDate, endDate: effectiveEnd(r)!, halfDay: r.halfDay })),
      );
    },

    // ---------- holidays ----------

    async holidays(_actor: Actor, year: number): Promise<Result<Array<{ id: string; date: IsoDate; name: string }>>> {
      return ok(await store.calendar.listHolidays(`${year}-01-01`, `${year}-12-31`));
    },

    async addHoliday(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "leave.manage")) return forbidden("Only HR and the owner manage holidays.");
      const parsed = parse(holidaySchema, raw);
      if (!parsed.ok) return parsed;
      return commit(store, async (repos) => {
        if (await repos.calendar.findHolidayOn(parsed.value.date)) return conflict("There's already a holiday on that date.");
        const id = newId();
        await repos.calendar.addHoliday(id, parsed.value.date, parsed.value.name);
        return change({ id }, { actorId: actor.personId, action: "holiday.added", entityType: "holiday", entityId: id, data: parsed.value });
      });
    },

    async removeHoliday(actor: Actor, holidayId: string): Promise<Result<{ id: string }>> {
      if (!can(actor, "leave.manage")) return forbidden("Only HR and the owner manage holidays.");
      if (!isId(holidayId)) return notFound("That holiday");
      return commit(store, async (repos) => {
        const removed = await repos.calendar.removeHoliday(holidayId);
        if (!removed) return notFound("That holiday");
        if (removed.date < clock.today()) return conflict("Past holidays can't be removed: leave already taken depends on them.");
        // Leave covering that day now counts it. Refuse if that would take anyone below zero (D46).
        const affected = await repos.leave.listRequests({ statuses: ACTIVE, overlapping: { from: removed.date, to: removed.date } });
        if (affected.length) {
          const year = yearOf(removed.date);
          const calendar = await calendarFor(repos, `${year}-01-01`, `${year}-12-31`);
          const [types, grants] = await Promise.all([repos.leave.listTypes(), repos.leave.listGrants(affected.map((r) => r.personId))]);
          const short: string[] = [];
          for (const r of affected) {
            const person = await repos.people.findById(r.personId);
            const type = types.find((t) => t.id === r.leaveTypeId);
            if (!person || !type) continue;
            const requests = await repos.leave.listRequests({ personIds: [person.id], statuses: ACTIVE });
            const available = balanceFor(person, type, year, requests, grants, calendar).availableHalfDays;
            if (available !== null && available < 0) short.push(person.fullName);
          }
          if (short.length) return conflict(`Removing it would take ${[...new Set(short)].join(", ")} below zero: they have leave on that day. Sort that out first.`);
        }
        return change({ id: holidayId }, { actorId: actor.personId, action: "holiday.removed", entityType: "holiday", entityId: holidayId, data: { date: removed.date, name: removed.name } });
      });
    },

    // ---------- the working week (owner, Settings) ----------

    async workWeek(actor: Actor): Promise<Result<WorkWeek>> {
      if (!can(actor, "settings.manage")) return forbidden("Only the owner changes the working week.");
      return ok((await store.calendar.getSetting<WorkWeek>("work_week")) ?? DEFAULT_WORK_WEEK);
    },

    /**
     * Change the working days (D32, D73). It applies to every date, so booked leave is recounted: refused if that
     * would take anyone below zero this year or next (D46).
     */
    async setWorkWeek(actor: Actor, raw: unknown): Promise<Result<WorkWeek>> {
      if (!can(actor, "settings.manage")) return forbidden("Only the owner changes the working week.");
      const parsed = parse(workWeekSchema, raw);
      if (!parsed.ok) return parsed;
      const next: WorkWeek = parsed.value;
      return commit(store, async (repos) => {
        const before = (await repos.calendar.getSetting<WorkWeek>("work_week")) ?? DEFAULT_WORK_WEEK;
        if (JSON.stringify(before) === JSON.stringify(next)) return noChange(next);
        await repos.calendar.setSetting("work_week", next, actor.personId);

        const year = yearOf(clock.today());
        const short = new Set<string>();
        const types = await repos.leave.listTypes();
        for (const y of [year, year + 1]) {
          const booked = await repos.leave.listRequests({ statuses: ACTIVE, overlapping: yearSpan(y) });
          if (booked.length === 0) continue;
          const personIds = [...new Set(booked.map((r) => r.personId))];
          const [calendar, grants, requests] = await Promise.all([
            calendarFor(repos, `${y}-01-01`, `${y}-12-31`),
            repos.leave.listGrants(personIds),
            repos.leave.listRequests({ personIds, statuses: ACTIVE }),
          ]);
          for (const personId of personIds) {
            const person = await repos.people.findById(personId);
            if (!person) continue;
            for (const type of types.filter((t) => booked.some((r) => r.personId === personId && r.leaveTypeId === t.id))) {
              const available = balanceFor(person, type, y, requests, grants, calendar).availableHalfDays;
              if (available !== null && available < 0) short.add(person.fullName);
            }
          }
        }
        if (short.size) return conflict(`That would take ${[...short].join(", ")} below zero: their booked leave would count more days. Sort that out first.`);
        return change(next, { actorId: actor.personId, action: "setting.changed", entityType: "setting", entityId: settingId("work_week"), data: { key: "work_week", from: before, to: next } });
      });
    },

    // ---------- HR settings ----------

    async types(actor: Actor): Promise<Result<LeaveTypeRecord[]>> {
      if (!can(actor, "leave.manage")) return forbidden("Only HR and the owner manage leave types.");
      return ok(await store.leave.listTypes());
    },

    /** A new leave type, with its yearly days per contract type (test report H2). */
    async addType(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "leave.manage")) return forbidden("Only HR and the owner manage leave types.");
      const parsed = parse(leaveTypeSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      const key = v.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) || "leave";
      return commit(store, async (repos) => {
        const existing = await repos.leave.listTypes();
        if (existing.some((t) => t.name.toLowerCase() === v.name.toLowerCase())) return invalid("There's already a leave type with that name.", { name: ["There's already a leave type with that name."] });
        let unique = key;
        for (let i = 2; existing.some((t) => t.key === unique); i++) unique = `${key}_${i}`;
        const id = newId();
        await repos.leave.createType({
          id,
          key: unique,
          name: v.name,
          usesBalance: v.kind !== "unpaid",
          grantedOnly: v.kind === "granted",
          grantExpiryDays: v.kind === "granted" && typeof v.grantExpiryDays === "number" ? v.grantExpiryDays : null,
          allowHalfDay: v.allowHalfDay === "on",
          maxBackdateDays: v.maxBackdateDays,
          position: existing.length,
        });
        if (v.kind === "quota") {
          for (const e of ["full_time", "part_time", "intern"] as const) {
            const days = v[e];
            if (typeof days === "number" && days > 0) {
              if (!Number.isInteger(days * 2)) return invalid("Days go in half-day steps.", { [e]: ["Half-day steps, like 12 or 7.5."] });
              await repos.leave.setQuota(id, e, Math.round(days * 2));
            }
          }
        }
        return change({ id }, { actorId: actor.personId, action: "leave.type_added", entityType: "leave_type", entityId: id, data: { name: v.name, kind: v.kind } });
      });
    },

    /** Retire a leave type (no new requests; past ones stay) or bring it back. */
    async setTypeActive(actor: Actor, raw: unknown): Promise<Result<null>> {
      if (!can(actor, "leave.manage")) return forbidden("Only HR and the owner manage leave types.");
      const parsed = parse(z.object({ leaveTypeId: z.uuid(), active: z.enum(["yes", "no"]) }), raw);
      if (!parsed.ok) return parsed;
      return commit(store, async (repos) => {
        const type = await repos.leave.findType(parsed.value.leaveTypeId);
        if (!type) return notFound("That leave type");
        const active = parsed.value.active === "yes";
        if (type.active === active) return noChange(null);
        await repos.leave.updateType(type.id, { active });
        return change(null, { actorId: actor.personId, action: active ? "leave.type_restored" : "leave.type_retired", entityType: "leave_type", entityId: type.id, data: { name: type.name } });
      });
    },

    async setQuota(actor: Actor, raw: unknown): Promise<Result<{ halfDays: number }>> {
      if (!can(actor, "leave.manage")) return forbidden("Only HR and the owner manage leave quotas.");
      const parsed = parse(quotaSchema, raw);
      if (!parsed.ok) return parsed;
      const halfDays = Math.round(parsed.value.days * 2);
      return commit(store, async (repos) => {
        const type = await repos.leave.findType(parsed.value.leaveTypeId);
        if (!type) return notFound("That leave type");
        if (type.grantedOnly || !type.usesBalance) return invalid(`${type.name} has no yearly quota.`);
        await repos.leave.setQuota(type.id, parsed.value.employmentType, halfDays);
        return change({ halfDays }, {
          actorId: actor.personId,
          action: "leave.quota_changed",
          entityType: "leave_type",
          entityId: type.id,
          data: { employmentType: parsed.value.employmentType, from: type.quotas[parsed.value.employmentType] ?? 0, to: halfDays },
        });
      });
    },

    /** Comp-off for weekend or shoot work, or an HR correction (negative) to any balance. */
    async grant(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "leave.manage")) return forbidden("Only HR and the owner grant leave.");
      const parsed = parse(grantSchema, raw);
      if (!parsed.ok) return parsed;
      const { personId, leaveTypeId, days, reason } = parsed.value;
      if (personId === actor.personId && !actor.roles.includes("owner")) return forbidden("Ask the owner to grant leave to you.");
      return commit(store, async (repos) => {
        const [person, type] = await Promise.all([repos.people.lockForUpdate(personId), repos.leave.findType(leaveTypeId)]);
        if (!person || person.status !== "active") return notFound("That person");
        if (!type || !type.usesBalance) return invalid("Pick a leave type that has a balance.");
        const today = clock.today();
        const id = newId();
        const halfDays = Math.round(days * 2);
        if (halfDays < 0) {
          // A correction can't take someone below zero (D46).
          const calendar = await calendarFor(repos, `${yearOf(today)}-01-01`, `${yearOf(today)}-12-31`);
          const [requests, grants] = await Promise.all([repos.leave.listRequests({ personIds: [personId], statuses: ACTIVE }), repos.leave.listGrants([personId])]);
          const available = balanceFor(person, type, yearOf(today), requests, grants, calendar).availableHalfDays ?? 0;
          if (available + halfDays < 0) return conflict(`${person.fullName} has only ${daysLabel(available)} of ${type.name.toLowerCase()}; you can't take away more.`);
        }
        await repos.leave.createGrant(id, {
          personId,
          leaveTypeId,
          halfDays,
          grantedOn: today,
          expiresOn: type.grantExpiryDays && halfDays > 0 ? addDays(today, type.grantExpiryDays) : null,
          reason,
          grantedById: actor.personId,
        });
        return change({ id }, { actorId: actor.personId, action: "leave.granted", entityType: "leave_grant", entityId: id, personId, data: { type: type.key, halfDays, reason } });
      });
    },
  };
}

export type LeaveService = ReturnType<typeof createLeaveService>;
