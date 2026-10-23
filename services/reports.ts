// Monthly client reports (Stage 11.4): the month's numbers gathered from the data (results, Meta ads, deliverables,
// tasks, creatives, posts), with words around them that the AI drafts or a person writes. The AI never supplies a
// number. Strategists and the owner write, edit and make a report final; a final report is frozen and printable.
// Nothing is sent anywhere from here. With the AI off, the report is the numbers with empty boxes to fill in.
import type { ClientLinksService } from "./client-links";
import { z } from "zod";
import { addMonths, endOfMonth, istInstant, minDate, startOfMonth, type IsoDate } from "@/lib/dates";
import { formatMonth } from "@/lib/format";
import { isId, newId } from "@/lib/id";
import { conflict, forbidden, invalid, notFound, ok, type Result } from "@/lib/result";
import type { ReportStatus } from "@/lib/types";
import { id, parse } from "@/lib/validation/common";
import type { DataStore, ReportRecord, ReportText } from "@/repositories";
import type { createAdService } from "./ads";
import type { AiService } from "./ai";
import { change, commit } from "./change";
import type { Clock } from "./clock";
import { can, clientScope, type Actor } from "./permissions";
import { parseReportSections, REPORT_SYSTEM, reportQuestion, type ReportFacts } from "./rules/reports";
import { burn } from "./rules/retainer";
import { costPer, ratePercent } from "./rules/results";

const DENIED = "Client reports are for strategists, performance marketers, the accountant and the owner.";
const DENIED_WRITE = "Client reports are written by strategists and the owner.";
const MAX_TEXT = 6000;
const TITLES_SHOWN = 15;

const monthField = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, { message: "Pick a month." })
  .transform((v) => `${v}-01`);
const keySchema = z.object({ clientId: id, month: monthField, version: z.coerce.number().int().min(1) });
const box = z.string().trim().max(MAX_TEXT, { message: `Keep it under ${MAX_TEXT.toLocaleString("en-IN")} characters.` }).optional().default("");
const textSchema = keySchema.extend({ summary: box, wentWell: box, nextSteps: box });

export type ClientReport = Omit<ReportRecord, "facts"> & { facts: ReportFacts };
export type ReportPage = {
  clientId: string;
  clientName: string;
  /** Stage 14.5: Oppllo's own monthly self-report ("Oppllo – <month>"); never in any portal. */
  self: boolean;
  month: IsoDate;
  thisMonth: IsoDate;
  report: ClientReport | null;
  /** The client's reports, newest first, for moving between months. */
  others: Array<{ month: IsoDate; status: ReportStatus }>;
  canEdit: boolean;
  /** Why the AI can't write the words now (no key, limit reached…), or null when it can. */
  aiBlocked: string | null;
};

export function createReportService(deps: { store: DataStore; clock: Clock; ai: Pick<AiService, "ask" | "status">; ads: Pick<ReturnType<typeof createAdService>, "forClient">; files?: Pick<ClientLinksService, "summariesForReport"> }) {
  const { store, clock, ai } = deps;

  const sheetLines = async (actor: Actor, clientId: string) => {
    const lines = deps.files ? await deps.files.summariesForReport(actor, clientId) : [];
    return lines.length ? `\n\n<sheets>\n${lines.join("\n").replace(/</g, "‹")}\n</sheets>\nUse the sheets only where they agree with the facts.` : "";
  };

  async function visibleClient(actor: Actor, clientId: string) {
    if (!isId(clientId)) return null;
    return store.clients.findById(clientId, clientScope(actor));
  }

  /** Everything the month's report shows, read now. */
  async function gather(actor: Actor, clientId: string, name: string, month: IsoDate): Promise<ReportFacts> {
    let clientName = name;
    const today = clock.today();
    const thisMonth = startOfMonth(today);
    const last = endOfMonth(month);
    const on = minDate(last, today);
    const [from, to] = [istInstant(month, "00:00"), istInstant(addMonths(month, 1), "00:00")];
    const range = month === thisMonth ? "this_month" : month === addMonths(thisMonth, -1) ? "last_month" : null;
    const [[stored], engagements, done, approved, posts, time, ads] = await Promise.all([
      store.results.list({ clientIds: [clientId], from: month, to: month }),
      store.engagements.listForClients([clientId], { on, includeFees: false, includeBudgets: true, activeOnly: false }),
      store.tasks.list({ scope: { kind: "all" }, clientId, statuses: ["done"], completedSince: from, limit: 2000 }),
      // shortcut: "approved this month" is read from the creative's last change, not its approval date; add
      // approvedAt to the asset list if reports start counting creatives approved and then edited.
      store.assets.list({ scope: { kind: "all" }, clientId, states: ["approved"], limit: 1000 }),
      store.content.list({ clientId, from: month, to: last }),
      // shortcut: reads the whole team's month and keeps this client's; give time.list a clientId filter if it slows.
      store.time.list({ from: month, to: last }),
      range ? deps.ads.forClient(actor, clientId, range) : Promise.resolve(null),
    ]);
    // Oppllo's own space (14.5): Sales fills what nobody typed, as on its results card; it reports as "Oppllo".
    const self = (await store.clients.findById(clientId, { kind: "all" }))?.isSelf ? await store.results.selfLive(month) : null;
    const result = self
      ? { ...(stored ?? { spendPaise: null, targetLeads: null, targetAdmissions: null }), leads: stored?.leads ?? self.leads, callsBooked: stored?.callsBooked ?? self.demos, admissions: stored?.admissions ?? self.won }
      : stored;
    if (self) clientName = "Oppllo";
    const live = engagements.filter((e) => e.startDate <= last && (!e.endDate || e.endDate >= month));
    const retainers = live.filter((e) => e.kind === "retainer").map((e) => e.id);
    const [deliverables, periods] = await Promise.all([store.engagements.deliverablesProgress(live.map((e) => e.id), month, last), store.engagements.periodsOn(retainers, on)]);
    const burns = periods.filter((p) => p.periodStart === month && p.baseBudgetMinutes + p.rolloverInMinutes > 0).map((p) => burn({ ...p, periodStart: p.coveredFrom, periodEnd: p.coveredTo, today: on }).usedPercent);
    const finished = done.filter((t) => t.completedAt && t.completedAt < to);
    const a = ads?.ok && ads.value.state === "ok" && ads.value.insights.currency === "INR" && ads.value.insights.since.slice(0, 7) === month.slice(0, 7) ? ads.value.insights.totals : null;
    return {
      month,
      clientName,
      results: result
        ? {
            leads: result.leads,
            spendPaise: result.spendPaise,
            callsBooked: result.callsBooked,
            admissions: result.admissions,
            targetLeads: result.targetLeads,
            targetAdmissions: result.targetAdmissions,
            costPerLeadPaise: costPer(result.spendPaise, result.leads),
            costPerAdmissionPaise: costPer(result.spendPaise, result.admissions),
            leadToAdmissionPercent: ratePercent(result.admissions, result.leads),
          }
        : null,
      ads: a ? { spendPaise: a.spendMinor, leads: a.leads, clicks: a.clicks, impressions: a.impressions, costPerLeadPaise: costPer(a.spendMinor, a.leads) } : null,
      deliverables: deliverables.map((d) => ({ name: d.name, delivered: d.delivered, target: d.targetCount })),
      tasksDone: { count: finished.length, titles: finished.slice(0, TITLES_SHOWN).map((t) => t.title) },
      creativesApproved: approved.filter((x) => x.updatedAt >= from && x.updatedAt < to).length,
      postsPublished: posts.filter((p) => p.status === "published").length,
      internal: { minutesLogged: time.filter((e) => e.clientId === clientId).reduce((s, e) => s + e.minutes, 0), burnPercent: burns.length ? Math.max(...burns) : null },
      gatheredAt: clock.now().toISOString(),
    };
  }

  /** The report behind a write: this person may write, the client is theirs, the month has started. */
  async function writable(actor: Actor, clientId: string, month: IsoDate) {
    if (!can(actor, "reports.write")) return forbidden(DENIED_WRITE);
    const client = await visibleClient(actor, clientId);
    if (!client) return notFound("That client");
    if (month > startOfMonth(clock.today())) return invalid("Reports are for months that have started.");
    return ok({ client, report: await store.reports.find(clientId, month) });
  }

  const event = (actor: Actor, r: Pick<ReportRecord, "id" | "clientId" | "month">, action: string, data: Record<string, unknown> = {}) => ({
    actorId: actor.personId,
    action,
    entityType: "client_report" as const,
    entityId: r.id,
    clientId: r.clientId,
    data: { month: r.month, monthLabel: formatMonth(r.month), ...data },
  });

  const stale = () => conflict("This report changed in the meantime (or was made final). Reload the page and try again.");

  return {
    /** A client's report for a month ("YYYY-MM"; last month when missing). */
    async page(actor: Actor, clientId: string, monthRaw?: string): Promise<Result<ReportPage>> {
      if (!can(actor, "results.read")) return forbidden(DENIED);
      const client = await visibleClient(actor, clientId);
      if (!client) return notFound("That client");
      const thisMonth = startOfMonth(clock.today());
      const month = monthRaw && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthRaw) ? `${monthRaw}-01` : addMonths(thisMonth, -1);
      if (month > thisMonth) return invalid("Reports are for months that have started.");
      const canEdit = can(actor, "reports.write");
      const [report, others, status] = await Promise.all([store.reports.find(clientId, month), store.reports.list(clientId), canEdit ? ai.status(actor) : Promise.resolve({ ready: false, reason: null })]);
      return ok({
        clientId,
        clientName: client.name,
        self: client.isSelf,
        month,
        thisMonth,
        report: report ? { ...report, facts: report.facts as ReportFacts } : null,
        others,
        canEdit,
        aiBlocked: canEdit && !status.ready ? (status.reason ?? "The AI isn't available.") : null,
      });
    },

    /** Start the month's report: the numbers now, the words empty (or the AI's, with writeWithAi). */
    async create(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      const parsed = parse(z.object({ clientId: id, month: monthField }), raw);
      if (!parsed.ok) return parsed;
      const { clientId, month } = parsed.value;
      const w = await writable(actor, clientId, month);
      if (!w.ok) return w;
      if (w.value.report) return ok({ id: w.value.report.id });
      const facts = await gather(actor, clientId, w.value.client.name, month);
      const reportId = newId();
      return commit(store, async (repos) => {
        if (!(await repos.reports.create({ id: reportId, clientId, month, facts, createdById: actor.personId }))) return conflict("Someone started this report a moment ago. Reload the page.");
        return change({ id: reportId }, event(actor, { id: reportId, clientId, month }, "client.report_created"));
      });
    },

    /** Read the numbers again (a draft only: results entered late, Meta caught up). */
    async refreshNumbers(actor: Actor, raw: unknown): Promise<Result<null>> {
      const parsed = parse(keySchema, raw);
      if (!parsed.ok) return parsed;
      const { clientId, month, version } = parsed.value;
      const w = await writable(actor, clientId, month);
      if (!w.ok) return w;
      const r = w.value.report;
      if (!r) return notFound("That report");
      const facts = await gather(actor, clientId, w.value.client.name, month);
      return commit(store, async (repos) => {
        if (!(await repos.reports.update(r.id, version, { facts, updatedById: actor.personId }, clock.now()))) return stale();
        return change(null, event(actor, r, "client.report_saved", { numbers: true }));
      });
    },

    /** The AI drafts the words from the report's numbers and the client's tone. A person edits them after. */
    async writeWithAi(actor: Actor, raw: unknown): Promise<Result<null>> {
      const parsed = parse(keySchema, raw);
      if (!parsed.ok) return parsed;
      const { clientId, month, version } = parsed.value;
      const w = await writable(actor, clientId, month);
      if (!w.ok) return w;
      const r = w.value.report;
      if (!r) return notFound("That report");
      if (r.status === "final" || r.version !== version) return stale();
      const tone = (await store.knowledge.list([clientId])).knowledge[0]?.tone ?? "";
      const answer = await ai.ask(actor, "client_report", {
        system: REPORT_SYSTEM,
        // 13.0: the client's Media plan summaries (named ranges the team mapped), as more data.
        turns: [{ role: "user", text: `${reportQuestion(r.facts as ReportFacts, tone)}${await sheetLines(actor, clientId)}` }],
        tools: [],
        effort: "medium",
        maxOutputTokens: 1500,
        maxSteps: 1,
        maxCostMicroUsd: 80_000,
      });
      if (!answer.ok) return answer;
      const text = parseReportSections(answer.value.text);
      return commit(store, async (repos) => {
        if (!(await repos.reports.update(r.id, version, { ...text, aiUsageId: answer.value.usageId, updatedById: actor.personId }, clock.now()))) return stale();
        return change(null, event(actor, r, "client.report_saved", { ai: true }));
      });
    },

    async save(actor: Actor, raw: unknown): Promise<Result<null>> {
      const parsed = parse(textSchema, raw);
      if (!parsed.ok) return parsed;
      const { clientId, month, version, ...text } = parsed.value;
      const w = await writable(actor, clientId, month);
      if (!w.ok) return w;
      const r = w.value.report;
      if (!r) return notFound("That report");
      if (r.version === version && (Object.keys(text) as Array<keyof ReportText>).every((k) => r[k] === text[k])) return ok(null);
      return commit(store, async (repos) => {
        if (!(await repos.reports.update(r.id, version, { ...text, updatedById: actor.personId }, clock.now()))) return stale();
        return change(null, event(actor, r, "client.report_saved"));
      });
    },

    /** Make the report final: frozen from now on, numbers and words, ready to print or save as PDF. */
    async finalize(actor: Actor, raw: unknown): Promise<Result<null>> {
      const parsed = parse(keySchema, raw);
      if (!parsed.ok) return parsed;
      const { clientId, month, version } = parsed.value;
      const w = await writable(actor, clientId, month);
      if (!w.ok) return w;
      const r = w.value.report;
      if (!r) return notFound("That report");
      if (!r.summary.trim()) return invalid("Write the summary before making the report final.", { summary: ["Write a short summary first."] });
      return commit(store, async (repos) => {
        if (!(await repos.reports.finalize(r.id, version, actor.personId, clock.now()))) return stale();
        return change(null, event(actor, r, "client.report_finalized"));
      });
    },
  };
}

export type ReportService = ReturnType<typeof createReportService>;
