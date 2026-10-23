// Results per client (Stage 11.1): each month's leads, ad spend, counselling calls booked and admissions, with
// targets, so the work is judged by what the client pays for. Strategists, performance marketers and the owner enter
// and read them; the accountant reads. Leads and spend come pre-filled from Meta (10.1) when the client is linked.
import { addMonths, endOfMonth, minDate, startOfMonth, type IsoDate } from "@/lib/dates";
import { isId, newId } from "@/lib/id";
import { forbidden, invalid, notFound, ok, type Result } from "@/lib/result";
import type { ResultSource } from "@/lib/types";
import { parse } from "@/lib/validation/common";
import { resultsSchema } from "@/lib/validation/results";
import type { ClientRecord, SelfLive, DataStore, MonthNumbers, MonthResultRecord } from "@/repositories";
import type { createAdService } from "./ads";
import { change, commit, noChange } from "./change";
import type { Clock } from "./clock";
import { can, clientScope, type Actor } from "./permissions";
import { burn } from "./rules/retainer";
import { clientHealth, costPer, judgedMonth, ratePercent, type Health } from "./rules/results";

const DENIED = "Results are for strategists, performance marketers, the accountant and the owner.";
const DENIED_WRITE = "Results are entered by strategists, performance marketers and the owner.";
const MONTHS_SHOWN = 6;

export type MonthView = MonthResultRecord & {
  costPerLeadPaise: number | null;
  costPerAdmissionPaise: number | null;
  leadToAdmissionPercent: number | null;
};

export type ClientResults = {
  /** Stage 14.5: Oppllo's own marketing space: leads, demos and won colleges read live from Sales. */
  self: { byChannel: SelfLive["byChannel"] } | null;
  thisMonth: IsoDate;
  /** The last six months, newest first; null where nothing was entered. */
  months: Array<{ month: IsoDate; result: MonthView | null }>;
  health: Health;
  canEdit: boolean;
};

export type MetaPrefill =
  | { state: "used"; leads: number; spendPaise: number }
  | { state: "not_linked" | "not_connected" | "other_month" | "not_inr" }
  | { state: "error"; message: string };

export type ResultsForm = {
  clientId: string;
  clientName: string;
  month: IsoDate;
  thisMonth: IsoDate;
  values: MonthNumbers;
  sources: { leads: ResultSource; spend: ResultSource };
  meta: MetaPrefill;
  saved: { at: Date; byName: string | null } | null;
  /** Stage 14.5: the self space's live numbers for the month (they fill what nobody typed). */
  live: SelfLive | null;
};

export type AtRiskClient = { clientId: string; clientName: string; health: Health };

const view = (r: MonthResultRecord): MonthView => ({
  ...r,
  costPerLeadPaise: costPer(r.spendPaise, r.leads),
  costPerAdmissionPaise: costPer(r.spendPaise, r.admissions),
  leadToAdmissionPercent: ratePercent(r.admissions, r.leads),
});

const EMPTY: MonthNumbers = { leads: null, spendPaise: null, callsBooked: null, admissions: null, targetLeads: null, targetAdmissions: null };

/**
 * The numbers health judges for a month: that month's row, or, when nothing was entered yet, the latest earlier
 * targets with no results (targets carry forward until changed).
 */
function judgedNumbers(rows: readonly MonthResultRecord[], month: IsoDate): MonthNumbers | null {
  const exact = rows.find((r) => r.month === month);
  if (exact) return exact;
  const earlier = rows.filter((r) => r.month < month && (r.targetLeads || r.targetAdmissions)).at(-1);
  return earlier ? { ...EMPTY, targetLeads: earlier.targetLeads, targetAdmissions: earlier.targetAdmissions } : null;
}

export function createResultService(deps: { store: DataStore; clock: Clock; ads: Pick<ReturnType<typeof createAdService>, "forClient"> }) {
  const { store, clock } = deps;

  async function visibleClient(actor: Actor, clientId: string) {
    if (!isId(clientId)) return null;
    return store.clients.findById(clientId, clientScope(actor));
  }

  /** The highest retainer burn right now per client, for people who may see hours budgets (budget.read). */
  async function burnByClient(actor: Actor, clientIds: readonly string[], today: IsoDate): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (!can(actor, "budget.read") || clientIds.length === 0) return out;
    const retainers = (await store.engagements.listForClients(clientIds, { on: today, includeFees: false, includeBudgets: true, activeOnly: true })).filter((e) => e.kind === "retainer");
    const clientOf = new Map(retainers.map((e) => [e.id, e.clientId]));
    for (const p of await store.engagements.periodsOn([...clientOf.keys()], today)) {
      if (p.baseBudgetMinutes + p.rolloverInMinutes <= 0) continue;
      // The same calculation as the client page and the dashboard, so the numbers agree.
      const used = burn({ ...p, periodStart: p.coveredFrom, periodEnd: p.coveredTo, today }).usedPercent;
      const clientId = clientOf.get(p.engagementId)!;
      out.set(clientId, Math.max(out.get(clientId) ?? 0, used));
    }
    return out;
  }

  /** What Meta reported for the month, when the client is linked and the month is this one or the last. */
  async function metaFor(actor: Actor, clientId: string, month: IsoDate): Promise<MetaPrefill> {
    const thisMonth = startOfMonth(clock.today());
    const range = month === thisMonth ? "this_month" : month === addMonths(thisMonth, -1) ? "last_month" : null;
    if (!range) return { state: "other_month" };
    const r = await deps.ads.forClient(actor, clientId, range);
    if (!r.ok) return { state: "not_connected" };
    const a = r.value;
    if (a.state === "not_linked" || a.state === "not_connected") return { state: a.state };
    if (a.state === "error") return { state: "error", message: a.message };
    // Only rupee accounts: spendMinor is paise then. Meta's month must be the one being entered.
    if (a.insights.currency !== "INR") return { state: "not_inr" };
    if (a.insights.since.slice(0, 7) !== month.slice(0, 7)) return { state: "other_month" };
    return { state: "used", leads: a.insights.totals.leads, spendPaise: a.insights.totals.spendMinor };
  }

  /** The retainer the month belongs to when there is exactly one; otherwise the results stay with the client. */
  async function engagementFor(clientId: string, month: IsoDate): Promise<string | null> {
    const on = minDate(endOfMonth(month), clock.today());
    const retainers = (await store.engagements.listForClients([clientId], { on, includeFees: false, includeBudgets: false, activeOnly: true })).filter(
      (e) => e.kind === "retainer" && e.startDate <= endOfMonth(month) && (!e.endDate || e.endDate >= month),
    );
    return retainers.length === 1 ? retainers[0]!.id : null;
  }

  /**
   * Stage 14.5 (D-14.5b): Oppllo's own space reads leads, demos booked and colleges won live from Sales, month by
   * month; whatever a person typed wins, and targets carry forward like any client's. Other clients: unchanged.
   */
  async function withSelf(client: Pick<ClientRecord, "id" | "isSelf">, rows: MonthResultRecord[], months: readonly IsoDate[]): Promise<MonthResultRecord[]> {
    if (!client.isSelf) return rows;
    const out = [...rows];
    for (const month of months) {
      if (month > startOfMonth(clock.today())) continue;
      const live = await store.results.selfLive(month);
      const i = out.findIndex((r) => r.month === month);
      if (i >= 0) {
        const r = out[i]!;
        out[i] = { ...r, leads: r.leads ?? live.leads, callsBooked: r.callsBooked ?? live.demos, admissions: r.admissions ?? live.won };
        continue;
      }
      const carried = out.filter((r) => r.month < month && (r.targetLeads || r.targetAdmissions)).sort((a, b) => a.month.localeCompare(b.month)).at(-1);
      out.push({ id: "", clientId: client.id, engagementId: null, month, leads: live.leads, spendPaise: null, callsBooked: live.demos, admissions: live.won, targetLeads: carried?.targetLeads ?? null, targetAdmissions: carried?.targetAdmissions ?? null, leadsSource: "manual", spendSource: "manual", updatedByName: null, updatedAt: new Date(0) });
    }
    return out.sort((a, b) => a.month.localeCompare(b.month));
  }

  return {
    async forClient(actor: Actor, clientId: string): Promise<Result<ClientResults>> {
      if (!can(actor, "results.read")) return forbidden(DENIED);
      const client = await visibleClient(actor, clientId);
      if (!client) return notFound("That client");
      const today = clock.today();
      const thisMonth = startOfMonth(today);
      const [stored, burns] = await Promise.all([
        // A year back, so targets set before the six months shown still carry forward.
        store.results.list({ clientIds: [clientId], from: addMonths(thisMonth, -12), to: thisMonth }),
        burnByClient(actor, [clientId], today),
      ]);
      const shown = Array.from({ length: MONTHS_SHOWN }, (_, i) => addMonths(thisMonth, -i));
      const rows = await withSelf(client, stored, [...new Set([...shown, judgedMonth(today).month])].sort());
      const months = shown.map((month) => {
        const row = rows.find((r) => r.month === month);
        return { month, result: row ? view(row) : null };
      });
      const health = clientHealth({ today, results: judgedNumbers(rows, judgedMonth(today).month), burnPercent: burns.get(clientId) ?? null });
      return ok({ self: client.isSelf ? { byChannel: (await store.results.selfLive(thisMonth)).byChannel } : null, thisMonth, months, health, canEdit: can(actor, "results.write") });
    },

    /** Stage 14.5: Oppllo's own results (the space marked as Oppllo's own marketing). */
    async forSelf(actor: Actor): Promise<Result<ClientResults & { spaceId: string }>> {
      const id = await store.clients.selfSpaceId();
      if (!id) return notFound("Oppllo's own marketing space (mark one in Spaces, or apply the Oppllo Marketing kit)");
      const r = await this.forClient(actor, id);
      return r.ok ? ok({ ...r.value, spaceId: id }) : r;
    },

    /** The entry form for a month ("YYYY-MM"; this month when missing): what's saved, or Meta's numbers, and targets. */
    async form(actor: Actor, clientId: string, monthRaw?: string): Promise<Result<ResultsForm>> {
      if (!can(actor, "results.write")) return forbidden(DENIED_WRITE);
      const client = await visibleClient(actor, clientId);
      if (!client) return notFound("That client");
      const thisMonth = startOfMonth(clock.today());
      const month = monthRaw && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthRaw) ? `${monthRaw}-01` : thisMonth;
      if (month > thisMonth) return invalid("Results can't be entered for a month that hasn't started.");
      const [rows, meta] = await Promise.all([store.results.list({ clientIds: [clientId], from: addMonths(month, -12), to: month }), metaFor(actor, clientId, month)]);
      const saved = rows.find((r) => r.month === month);
      const carried = judgedNumbers(rows, month) ?? EMPTY;
      const values: MonthNumbers = saved ?? { ...EMPTY, targetLeads: carried.targetLeads, targetAdmissions: carried.targetAdmissions };
      const sources = { leads: saved?.leadsSource ?? "manual", spend: saved?.spendSource ?? "manual" } as ResultsForm["sources"];
      // Meta fills what nobody has entered yet; what a person typed is never overwritten.
      if (meta.state === "used") {
        if (values.leads === null) [values.leads, sources.leads] = [meta.leads, "meta"];
        if (values.spendPaise === null) [values.spendPaise, sources.spend] = [meta.spendPaise, "meta"];
      }
      // Oppllo's own space: Sales fills leads, demos and colleges won the same way (14.5).
      const live = client.isSelf ? await store.results.selfLive(month) : null;
      if (live) {
        values.leads ??= live.leads;
        values.callsBooked ??= live.demos;
        values.admissions ??= live.won;
      }
      return ok({ clientId, clientName: client.name, month, thisMonth, values, sources, meta, saved: saved ? { at: saved.updatedAt, byName: saved.updatedByName } : null, live });
    },

    async save(actor: Actor, raw: unknown): Promise<Result<{ id: string; month: IsoDate }>> {
      if (!can(actor, "results.write")) return forbidden(DENIED_WRITE);
      const parsed = parse(resultsSchema, raw);
      if (!parsed.ok) return parsed;
      const { clientId, month, spend, ...counts } = parsed.value;
      if (!(await visibleClient(actor, clientId))) return notFound("That client");
      if (month > startOfMonth(clock.today())) return invalid("Results can't be entered for a month that hasn't started.", { month: ["Pick this month or an earlier one."] });
      // A number counts as Meta's only when it is exactly what Meta reported; anything typed over it is manual.
      const [meta, engagementId] = await Promise.all([metaFor(actor, clientId, month), engagementFor(clientId, month)]);
      const fromMeta = meta.state === "used" ? meta : null;
      const numbers: MonthNumbers = { ...counts, spendPaise: spend };
      const leadsSource: ResultSource = fromMeta && counts.leads === fromMeta.leads ? "meta" : "manual";
      const spendSource: ResultSource = fromMeta && spend === fromMeta.spendPaise ? "meta" : "manual";
      return commit(store, async (repos) => {
        const [before] = await repos.results.list({ clientIds: [clientId], from: month, to: month });
        const same = before && (Object.keys(numbers) as Array<keyof MonthNumbers>).every((k) => before[k] === numbers[k]) && before.leadsSource === leadsSource && before.spendSource === spendSource;
        if (same) return noChange({ id: before.id, month });
        const id = await repos.results.save(newId(), { clientId, engagementId, month, ...numbers, leadsSource, spendSource, updatedById: actor.personId }, clock.now());
        const pick = (r: MonthNumbers | undefined) => (r ? Object.fromEntries((Object.keys(numbers) as Array<keyof MonthNumbers>).map((k) => [k, r[k]])) : null);
        return change(
          { id, month },
          { actorId: actor.personId, action: "client.results_saved", entityType: "client_result", entityId: id, clientId, data: { month, before: pick(before), after: pick(numbers), leadsSource, spendSource } },
        );
      });
    },

    /** Clients at risk or off track, worst first (the dashboard card), within the person's clients. */
    async atRisk(actor: Actor): Promise<Result<AtRiskClient[]>> {
      if (!can(actor, "results.read")) return forbidden(DENIED);
      const today = clock.today();
      const { month } = judgedMonth(today);
      const clients = (await store.clients.list(clientScope(actor))).filter((c) => c.status === "active" || c.status === "onboarding");
      const ids = clients.map((c) => c.id);
      const [rows, burns] = await Promise.all([store.results.list({ clientIds: ids, from: addMonths(month, -12), to: month }), burnByClient(actor, ids, today)]);
      const order = { off_track: 0, at_risk: 1 } as const;
      return ok(
        clients
          .map((c) => ({
            clientId: c.id,
            clientName: c.name,
            health: clientHealth({ today, results: judgedNumbers(rows.filter((r) => r.clientId === c.id), month), burnPercent: burns.get(c.id) ?? null }),
          }))
          .filter((c): c is AtRiskClient & { health: { level: "off_track" | "at_risk" } } => c.health.level === "off_track" || c.health.level === "at_risk")
          .sort((a, b) => order[a.health.level] - order[b.health.level] || a.clientName.localeCompare(b.clientName)),
      );
    },
  };
}
export type ResultService = ReturnType<typeof createResultService>;
