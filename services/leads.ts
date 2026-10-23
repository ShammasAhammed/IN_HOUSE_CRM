// Sales (Stage 10a, D88): the prospect pipeline that used to live in the CRM. Until switch day this is a read-only
// mirror of the CRM; the screens say so and link there for changes. On switch day the owner turns Sales on here
// ("sales_live"): the daily copy stops, and leads are worked in Oppllo One (D91).
import { addDays } from "@/lib/dates";
import { conflict, fail, forbidden, invalid, notFound, ok, type Result } from "@/lib/result";
import { isId, settingId } from "@/lib/id";
import { formatDateTime } from "@/lib/format";
import { LEAD_SCORES, LEAD_STAGE_LABELS, LEAD_STAGES, OPEN_LEAD_STAGES, type LeadScore, type LeadStage } from "@/lib/types";
import { bulkLeadSchema, createLeadSchema, leadFollowUpSchema, leadNoteSchema, leadOwnerSchema, leadStageSchema, leadTagsSchema, updateLeadSchema } from "@/lib/validation/leads";
import { parse } from "@/lib/validation/common";
import { z } from "zod";
import { change, commit, noChange } from "./change";
import { emailKey, phoneKey } from "./lead-import";
import type { DataStore, LeadActivityRecord, LeadDetailRecord, LeadFilter, LeadRow, LeadSourceRecord, LeadUpdate, LeadView, MessageTemplate, Repositories } from "@/repositories";
import { newId } from "@/lib/id";
import type { Clock } from "./clock";
import { AUTO_ASSIGN_KEY, type AutoAssign } from "./lead-intake";
import { readableLeadText, SALES_PERIODS, summarise, type SalesPeriod, type SalesSummary } from "./rules/sales";
import { can, type Actor } from "./permissions";
import { districtName, districtSpellings } from "./rules/districts";

const DENIED = "Sales leads are for the BDO, strategists, performance marketers and the owner.";
/** Won and lost leads stay on the board this long after they closed. */
const CLOSED_DAYS_ON_BOARD = 30;

export type SalesToday = {
  overdue: LeadRow[];
  dueToday: LeadRow[];
  unassigned: LeadRow[];
  /** Owned in the CRM by someone with no Oppllo One login yet: not unassigned, but nobody here can work them. */
  ownerWithoutLogin: LeadRow[];
  noNextStep: LeadRow[];
  /** New leads nobody has moved on for over 2 hours (speed to lead wins admissions deals). */
  waiting: LeadRow[];
  /** The person's open leads with nothing done for 7 days. */
  goingCold: LeadRow[];
};

export const TEMPLATES_KEY = "whatsapp_templates";
export const DEFAULT_TEMPLATES: MessageTemplate[] = [
  { id: "hello", name: "First hello", text: "Hi {name}, this is {me} from Oppllo Digital. Thanks for your enquiry about admissions for {institution}. When is a good time for a 15-minute call?" },
  { id: "hello-ml", name: "First hello (Malayalam)", text: "നമസ്കാരം {name}, ഞാൻ Oppllo Digital-ൽ നിന്ന് {me}. {institution}-ന്റെ അഡ്മിഷനെക്കുറിച്ചുള്ള അന്വേഷണത്തിന് നന്ദി. സംസാരിക്കാൻ സൗകര്യമുള്ള സമയം അറിയിക്കാമോ?" },
  { id: "audit", name: "Audit call reminder", text: "Hi {name}, a quick reminder of our admissions audit call for {institution} today. Speaking soon. {me}, Oppllo Digital" },
  { id: "proposal", name: "Proposal follow-up", text: "Hi {name}, did you get a chance to look at our proposal for {institution}? Happy to answer any questions. {me}, Oppllo Digital" },
];

/** A template with the lead's details filled in. */
export function fillTemplate(text: string, lead: { name: string; institution: string | null }, me: string): string {
  return text.replaceAll("{name}", lead.name).replaceAll("{institution}", lead.institution ?? "your institution").replaceAll("{me}", me.split(" ")[0] ?? me);
}
export type LeadPage = { lead: LeadDetailRecord; activities: LeadActivityRecord[] };
export type Mirror = { crmConnected: boolean; lastCopiedAt: Date | null; canCopy: boolean; live: boolean; canEdit: boolean };
export type SalesLive = { since: string; byId: string };
export const SALES_LIVE_KEY = "sales_live";

/** What the Leads screen can filter by (all optional). */
export type LeadListFilter = { stage?: string; owner?: string; q?: string; tag?: string; channel?: string; district?: string; segment?: string; score?: string; due?: string };

export type IntakeSetup = { sources: LeadSourceRecord[]; metaReady: boolean; googleReady: boolean; lastError: { at: string; source: string; message: string } | null };

export function createLeadService(deps: {
  store: DataStore;
  clock: Clock;
  crmConnected: boolean;
  intake?: { metaReady: boolean; googleReady: boolean };
  /** After a stage change commits: report it to the ad platforms (services/conversions.ts). */
  onStageChanged?: (leadId: string, stage: LeadStage) => Promise<unknown>;
  report?: (err: unknown, context?: Record<string, unknown>) => void;
}) {
  const { store, clock } = deps;
  /** Turns the screen's filter into the repository's, with India's days for "due". */
  /** Turns the screen's filter into the repository's; a district matches every spelling of it (QA S6-B3). */
  async function toFilter(actor: Actor, f: LeadListFilter, limit: number): Promise<LeadFilter> {
    const districts = f.district ? districtSpellings(f.district, (await store.leads.facets()).districts) : undefined;
    return { ...baseFilter(actor, f, limit), ...(districts ? { districts: districts.length ? districts : [f.district!] } : {}) };
  }

  function baseFilter(actor: Actor, f: LeadListFilter, limit: number): LeadFilter {
    const stage = f.stage === "open" || !f.stage ? OPEN_LEAD_STAGES : LEAD_STAGES.includes(f.stage as LeadStage) ? [f.stage as LeadStage] : undefined;
    const owner = f.owner === "me" ? actor.personId : f.owner === "none" || f.owner === "nologin" ? f.owner : f.owner && isId(f.owner) ? f.owner : undefined;
    const due =
      f.due === "overdue" ? { before: startOfIstDay() } : f.due === "today" ? { from: startOfIstDay(), before: startOfIstDay(1) } : f.due === "week" ? { from: startOfIstDay(), before: startOfIstDay(7) } : f.due === "none" ? ("none" as const) : undefined;
    return {
      ...(stage ? { stages: stage } : {}),
      ...(owner ? { ownerId: owner } : {}),
      ...(f.q ? { search: f.q.slice(0, 100) } : {}),
      ...(f.tag ? { tags: [f.tag] } : {}),
      ...(f.channel ? { channel: f.channel } : {}),
      ...(f.owner?.startsWith("crm:") ? { crmOwnerName: f.owner.slice(4) } : {}),
      ...(f.segment ? { segment: f.segment } : {}),
      ...((LEAD_SCORES as readonly string[]).includes(f.score ?? "") ? { score: f.score as LeadScore } : {}),
      ...(due ? { followUp: due } : {}),
      limit,
    };
  }

  /** Tags kept in the casing the team already uses ("neet" becomes "NEET" if that exists), no repeats. */
  async function normaliseTags(tags: readonly string[]): Promise<string[]> {
    const known = new Map((await store.leads.allTags()).map((t) => [t.tag.toLowerCase(), t.tag]));
    const out = new Map<string, string>();
    for (const t of tags) if (!out.has(t.toLowerCase())) out.set(t.toLowerCase(), known.get(t.toLowerCase()) ?? t);
    return [...out.values()];
  }

  const isLive = async () => Boolean(await store.calendar.getSetting<SalesLive>(SALES_LIVE_KEY));

  /** Every change to a lead: permission, switch-day check, lock, the change, its timeline entry and event. */
  async function edit(actor: Actor, leadId: string, fn: (lead: LeadDetailRecord, repos: Repositories, at: Date) => Promise<{ fields: LeadUpdate; activity: { type: "stage" | "note" | "followup" | "assign" | "edit"; text: string; fromStage?: string; toStage?: string } } | null | Result<never>>): Promise<Result<{ id: string }>> {
    if (!can(actor, "leads.write")) return forbidden("Only the BDO and the owner change leads.");
    if (!(await isLive())) return conflict("Sales is still worked in the CRM until switch day. Change it there for now.");
    if (!isId(leadId)) return notFound("That lead");
    return commit(store, async (repos) => {
      const lead = await repos.leads.lockForUpdate(leadId);
      if (!lead) return notFound("That lead");
      const at = clock.now();
      const outcome = await fn(lead, repos, at);
      if (outcome && "ok" in outcome) return outcome as never;
      if (!outcome) return noChange({ id: lead.id });
      await repos.leads.update(lead.id, outcome.fields, at);
      await repos.leads.addActivity({ leadId: lead.id, ...outcome.activity, byId: actor.personId, at });
      return change({ id: lead.id }, { actorId: actor.personId, action: `lead.${outcome.activity.type === "followup" ? "follow_up_set" : outcome.activity.type === "assign" ? "assigned" : outcome.activity.type === "stage" ? "stage_changed" : outcome.activity.type === "note" ? "note_added" : "edited"}`, entityType: "lead", entityId: lead.id, data: { text: outcome.activity.text } });
    });
  }
  const startOfIstDay = (offsetDays = 0) => new Date(`${addDays(clock.today(), offsetDays)}T00:00:00+05:30`);

  return {
    async mirror(actor: Actor): Promise<Result<Mirror>> {
      if (!can(actor, "leads.read")) return forbidden(DENIED);
      const live = await isLive();
      return ok({ crmConnected: deps.crmConnected, lastCopiedAt: await store.leads.lastCopiedAt(), canCopy: !live && can(actor, "settings.manage"), live, canEdit: live && can(actor, "leads.write") });
    },

    /** Leads per stage from the same table the Sales screens read, and when they were last copied from the CRM. */
    async stageCounts(actor: Actor): Promise<Result<{ byStage: Record<string, number>; asOf: Date | null }>> {
      if (!can(actor, "leads.read")) return forbidden(DENIED);
      const [counts, live] = await Promise.all([store.leads.counts(), isLive()]);
      return ok({ byStage: counts.byStage, asOf: live ? null : await store.leads.lastCopiedAt() });
    },

    async list(actor: Actor, filter: LeadListFilter = {}): Promise<Result<LeadRow[]>> {
      if (!can(actor, "leads.read")) return forbidden(DENIED);
      return ok(await store.leads.list(await toFilter(actor, filter, 500)));
    },

    /** The choices for the filter menus: tags in use, channels, districts, types. */
    async filterOptions(actor: Actor): Promise<Result<{ tags: Array<{ tag: string; count: number }>; channels: string[]; districts: string[]; segments: string[]; owners: Array<{ value: string; label: string }> }>> {
      if (!can(actor, "leads.read")) return forbidden(DENIED);
      const [tags, facets, owners] = await Promise.all([store.leads.allTags(), store.leads.facets(), store.leads.owners()]);
      // One entry per district however it's spelt, and every owner, CRM-only owners marked (QA S6-B3).
      const districts = [...new Set(facets.districts.map(districtName))].sort((a, b) => a.localeCompare(b));
      return ok({
        tags,
        ...facets,
        districts,
        owners: owners.map((o) => (o.id ? { value: o.id, label: o.name } : { value: `crm:${o.name}`, label: `${o.name} (no Oppllo login)` })),
      });
    },

    /** The leads matching a filter as a CSV file (BDO and owner: it holds phone numbers). Recorded as an event. */
    async exportCsv(actor: Actor, filter: LeadListFilter): Promise<Result<{ csv: string; count: number }>> {
      if (!can(actor, "leads.write")) return forbidden("Only the BDO and the owner export leads.");
      const rows = await store.leads.list(await toFilter(actor, filter, 20_000));
      const cell = (v: unknown) => {
        const s = v === null || v === undefined ? "" : v instanceof Date ? formatDateTime(v) : Array.isArray(v) ? v.join("; ") : String(v);
        // Quote, and defuse spreadsheet formulas (a value starting with = + - @ runs as a formula in Excel).
        const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
        return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
      };
      const head = ["Institution", "Name", "Phone", "Stage", "Score", "Tags", "Owner", "Next follow-up", "Channel", "Campaign", "District", "Type", "Lost reason", "Came in"];
      const lines = rows.map((l) => [l.institution, l.name, l.phone, LEAD_STAGE_LABELS[l.stage], l.score, l.tags, l.ownerName, l.nextFollowUpAt, l.channel, l.campaign, l.district, l.segment, l.lostReason, l.createdAt].map(cell).join(","));
      await commit(store, async () => change(null, { actorId: actor.personId, action: "leads.exported", entityType: "person", entityId: actor.personId, personId: actor.personId, data: { count: rows.length, filter } }));
      return ok({ csv: "\uFEFF" + [head.join(","), ...lines].join("\n") + "\n", count: rows.length });
    },

    /** The pipeline: every open lead by stage, plus the last month's won and lost. */
    async board(actor: Actor): Promise<Result<Array<{ stage: LeadStage; leads: LeadRow[] }>>> {
      if (!can(actor, "leads.read")) return forbidden(DENIED);
      const rows = await store.leads.list({ limit: 3000 });
      const since = startOfIstDay(-CLOSED_DAYS_ON_BOARD);
      return ok(
        LEAD_STAGES.map((stage) => ({
          stage,
          leads: rows.filter((l) => l.stage === stage && ((OPEN_LEAD_STAGES as readonly string[]).includes(stage) || (l.stageChangedAt ?? l.updatedAt) >= since)),
        })),
      );
    },

    /** The salesperson's day, like the CRM's Today: their follow-ups, plus leads nobody owns yet. */
    async today(actor: Actor): Promise<Result<SalesToday>> {
      if (!can(actor, "leads.read")) return forbidden(DENIED);
      const open = await store.leads.list({ stages: OPEN_LEAD_STAGES, limit: 3000 });
      const start = startOfIstDay();
      const end = startOfIstDay(1);
      const mine = open.filter((l) => l.ownerId === actor.personId);
      const byDue = (a: LeadRow, b: LeadRow) => (a.nextFollowUpAt?.getTime() ?? 0) - (b.nextFollowUpAt?.getTime() ?? 0);
      return ok({
        overdue: mine.filter((l) => l.nextFollowUpAt && l.nextFollowUpAt < start).sort(byDue),
        dueToday: mine.filter((l) => l.nextFollowUpAt && l.nextFollowUpAt >= start && l.nextFollowUpAt < end).sort(byDue),
        unassigned: open.filter((l) => !l.ownerId && !l.ownerName),
        // Their CRM owner has no Oppllo login (test report M5): add the person, or someone here takes them.
        ownerWithoutLogin: open.filter((l) => !l.ownerId && l.ownerName),
        noNextStep: mine.filter((l) => !l.nextFollowUpAt),
        waiting: open.filter((l) => l.stage === "new" && l.createdAt.getTime() < clock.now().getTime() - 2 * 3600_000 && l.createdAt.getTime() > clock.now().getTime() - 14 * 86_400_000),
        goingCold: mine.filter((l) => l.updatedAt.getTime() < clock.now().getTime() - 7 * 86_400_000),
      });
    },

    /** The sales dashboard for the last 7, 30 or 90 days, or all time (0). */
    async dashboard(actor: Actor, days: number): Promise<Result<SalesSummary & { days: SalesPeriod }>> {
      if (!can(actor, "leads.read")) return forbidden(DENIED);
      const period: SalesPeriod = (SALES_PERIODS as readonly number[]).includes(days) ? (days as SalesPeriod) : 30;
      const rows = await store.leads.list({ limit: 20_000 });
      return ok({ ...summarise(rows, clock.today(), period), days: period });
    },

    /** Where leads come in (owner): landing pages with their keys, and whether Meta and Google are set up. */
    async intakeSetup(actor: Actor): Promise<Result<IntakeSetup>> {
      if (!can(actor, "settings.manage")) return forbidden("Only the owner sets up where leads come in.");
      const [sources, lastError] = await Promise.all([store.leads.listSources(), store.calendar.getSetting<IntakeSetup["lastError"]>("lead_intake_last_error")]);
      return ok({ sources, metaReady: deps.intake?.metaReady ?? false, googleReady: deps.intake?.googleReady ?? false, lastError: lastError ?? null });
    },

    // ---------- working leads (after switch day) ----------

    /** Switch day (owner): Sales is worked here from now on, and the copy from the CRM stops. */
    async goLive(actor: Actor): Promise<Result<SalesLive>> {
      if (!can(actor, "settings.manage")) return forbidden("Only the owner switches Sales over.");
      return commit(store, async (repos) => {
        const already = await repos.calendar.getSetting<SalesLive>(SALES_LIVE_KEY);
        if (already) return noChange(already);
        const live: SalesLive = { since: clock.now().toISOString(), byId: actor.personId };
        await repos.calendar.setSetting(SALES_LIVE_KEY, live, actor.personId);
        return change(live, { actorId: actor.personId, action: "setting.changed", entityType: "setting", entityId: settingId(SALES_LIVE_KEY), data: { key: SALES_LIVE_KEY, to: live } });
      });
    },

    isLive,

    async create(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "leads.write")) return forbidden("Only the BDO and the owner add leads.");
      if (!(await isLive())) return conflict("Sales is still worked in the CRM until switch day. Add it there for now.");
      const parsed = parse(createLeadSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      // The same phone or email already here: say who, unless the person confirmed it's a different lead.
      const allowDuplicate = typeof raw === "object" && raw !== null && (raw as Record<string, unknown>).allowDuplicate === "on";
      if (!allowDuplicate) {
        const p = phoneKey(v.phone);
        const e = emailKey(v.email);
        const same = await store.leads.findByContacts(p ? [p] : [], e ? [e] : []);
        if (same.length) return fail("conflict", `Already in Oppllo: ${same.slice(0, 3).map((x) => x.institution ?? x.name).join(", ")}. Tick "Add anyway" if it's a different lead.`);
      }
      const id = newId();
      const at = clock.now();
      return commit(store, async (repos) => {
        const made = await repos.leads.create(
          {
            id, externalId: null, sourceKey: null, ...v, timeline: null, seats: null, admissions: null, feePaise: null, spendPaise: null, commissionPaise: null, costPerAdmissionPaise: null,
            stage: "new", lostReason: null, origin: "manual", landing: null, campaign: null, utmSource: null, utmMedium: null, utmContent: null, utmTerm: null,
            ownerId: actor.personId, ownerName: null, nextFollowUpAt: null, stageChangedAt: at, wonAt: null, lastNoteAt: null, answers: null, details: null, createdAt: at, updatedAt: at,
          },
          at,
        );
        if (made === "duplicate") return fail("conflict", "That lead already exists.");
        return change({ id }, { actorId: actor.personId, action: "lead.created", entityType: "lead", entityId: id, data: { name: v.name } });
      });
    },

    async update(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      const parsed = parse(updateLeadSchema, raw);
      if (!parsed.ok) return parsed;
      const { leadId, ...v } = parsed.value;
      return edit(actor, leadId, async (lead) => {
        const changed = (Object.keys(v) as Array<keyof typeof v>).filter((k) => (lead[k] ?? null) !== (v[k] ?? null));
        if (!changed.length) return null;
        return { fields: v, activity: { type: "edit", text: `Edited: ${changed.join(", ")}` } };
      });
    },

    async changeStage(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      const parsed = parse(leadStageSchema, raw);
      if (!parsed.ok) return parsed;
      const { leadId, stage, lostReason } = parsed.value;
      let moved = false;
      const r = await edit(actor, leadId, async (lead, _repos, at) => {
        if (lead.stage === stage) return null;
        moved = true;
        const fields: LeadUpdate = { stage, stageChangedAt: at, lostReason: stage === "lost" ? lostReason : lead.lostReason };
        if (stage === "won") fields.wonAt = at;
        // Like the CRM: whoever first moves an unowned lead takes it.
        if (!lead.ownerId) fields.ownerId = actor.personId;
        return { fields, activity: { type: "stage", fromStage: lead.stage, toStage: stage, text: `${LEAD_STAGE_LABELS[lead.stage]} → ${LEAD_STAGE_LABELS[stage]}${stage === "lost" ? ` (${lostReason})` : ""}` } };
      });
      // Tell the ad platforms after the change is saved; a failure there never undoes it.
      if (r.ok && moved && deps.onStageChanged) await deps.onStageChanged(leadId, stage).catch((err) => deps.report?.(err, { where: "conversions", leadId }));
      return r;
    },

    async assign(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      const parsed = parse(leadOwnerSchema, raw);
      if (!parsed.ok) return parsed;
      const { leadId, ownerId } = parsed.value;
      return edit(actor, leadId, async (lead, repos) => {
        if (lead.ownerId === ownerId) return null;
        const person = ownerId ? await repos.people.findById(ownerId) : null;
        if (ownerId && (!person || person.status !== "active")) return invalid("Pick someone on the team.");
        return { fields: { ownerId }, activity: { type: "assign", text: person ? `Assigned to ${person.fullName}` : "Unassigned" } };
      });
    },

    async addNote(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      const parsed = parse(leadNoteSchema, raw);
      if (!parsed.ok) return parsed;
      return edit(actor, parsed.value.leadId, async (_lead, _repos, at) => ({ fields: { lastNoteAt: at }, activity: { type: "note", text: parsed.value.text } }));
    },

    async setFollowUp(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      const parsed = parse(leadFollowUpSchema, raw);
      if (!parsed.ok) return parsed;
      const { leadId, at: when } = parsed.value;
      return edit(actor, leadId, async (lead) => {
        if ((lead.nextFollowUpAt?.getTime() ?? null) === (when?.getTime() ?? null)) return null;
        return { fields: { nextFollowUpAt: when }, activity: { type: "followup", text: when ? `Follow-up set for ${formatDateTime(when)}` : "Follow-up cleared" } };
      });
    },

    async setTags(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      const parsed = parse(leadTagsSchema, raw);
      if (!parsed.ok) return parsed;
      const tags = await normaliseTags(parsed.value.tags);
      return edit(actor, parsed.value.leadId, async (lead) => {
        if (JSON.stringify(lead.tags ?? []) === JSON.stringify(tags)) return null;
        return { fields: { tags }, activity: { type: "edit", text: tags.length ? `Tags: ${tags.join(", ")}` : "Tags cleared" } };
      });
    },

    /** One change to many leads at once (up to 200), all saved together. */
    async bulk(actor: Actor, raw: unknown): Promise<Result<{ changed: number }>> {
      if (!can(actor, "leads.write")) return forbidden("Only the BDO and the owner change leads.");
      if (!(await isLive())) return conflict("Sales is still worked in the CRM until switch day. Change it there for now.");
      const parsed = parse(bulkLeadSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      const tag = v.tag ? (await normaliseTags([v.tag]))[0]! : null;
      const followAt = v.action === "follow_up" ? (v.at ? new Date(`${v.at}:00+05:30`) : null) : undefined;
      const moved: string[] = [];
      const r = await commit(store, async (repos) => {
        const at = clock.now();
        const owner = v.action === "owner" && v.ownerId ? await repos.people.findById(v.ownerId) : null;
        if (v.action === "owner" && v.ownerId && (!owner || owner.status !== "active")) return invalid("Pick someone on the team.");
        const events = [];
        for (const leadId of [...new Set(v.ids)]) {
          const lead = await repos.leads.lockForUpdate(leadId);
          if (!lead) continue;
          let fields: LeadUpdate | null = null;
          let activity: { type: "stage" | "assign" | "edit" | "followup"; text: string; fromStage?: string; toStage?: string } | null = null;
          if (v.action === "stage" && v.stage && lead.stage !== v.stage) {
            fields = { stage: v.stage, stageChangedAt: at, lostReason: v.stage === "lost" ? (v.lostReason ?? null) : lead.lostReason, ...(v.stage === "won" ? { wonAt: at } : {}), ...(lead.ownerId ? {} : { ownerId: actor.personId }) };
            activity = { type: "stage", fromStage: lead.stage, toStage: v.stage, text: `${LEAD_STAGE_LABELS[lead.stage]} → ${LEAD_STAGE_LABELS[v.stage]}${v.stage === "lost" ? ` (${v.lostReason})` : ""}` };
            moved.push(lead.id);
          } else if (v.action === "owner" && (lead.ownerId ?? "") !== (v.ownerId ?? "")) {
            fields = { ownerId: v.ownerId || null };
            activity = { type: "assign", text: owner ? `Assigned to ${owner.fullName}` : "Unassigned" };
          } else if ((v.action === "tag_add" || v.action === "tag_remove") && tag) {
            const has = (lead.tags ?? []).some((t) => t.toLowerCase() === tag.toLowerCase());
            if (v.action === "tag_add" && !has && (lead.tags ?? []).length < 10) fields = { tags: [...(lead.tags ?? []), tag] };
            if (v.action === "tag_remove" && has) fields = { tags: (lead.tags ?? []).filter((t) => t.toLowerCase() !== tag.toLowerCase()) };
            if (fields) activity = { type: "edit", text: `${v.action === "tag_add" ? "Tagged" : "Untagged"} ${tag}` };
          } else if (v.action === "follow_up" && (lead.nextFollowUpAt?.getTime() ?? null) !== (followAt?.getTime() ?? null)) {
            fields = { nextFollowUpAt: followAt ?? null };
            activity = { type: "followup", text: followAt ? `Follow-up set for ${formatDateTime(followAt)}` : "Follow-up cleared" };
          }
          if (!fields || !activity) continue;
          await repos.leads.update(lead.id, fields, at);
          await repos.leads.addActivity({ leadId: lead.id, ...activity, byId: actor.personId, at });
          events.push({ actorId: actor.personId, action: `lead.bulk_${v.action}`, entityType: "lead" as const, entityId: lead.id, data: { text: activity.text } });
        }
        if (!events.length) return noChange({ changed: 0 });
        return change({ changed: events.length }, events[0]!, ...events.slice(1));
      });
      if (r.ok && deps.onStageChanged && v.stage) for (const id of moved) await deps.onStageChanged(id, v.stage).catch((err) => deps.report?.(err, { where: "conversions", leadId: id }));
      return r;
    },

    // ---------- saved views ----------

    async views(actor: Actor): Promise<Result<LeadView[]>> {
      if (!can(actor, "leads.read")) return forbidden(DENIED);
      return ok(await store.leads.views(actor.personId));
    },

    async saveView(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "leads.read")) return forbidden(DENIED);
      const parsed = parse(z.object({ name: z.string().trim().min(1, { message: "Name the view." }).max(40), query: z.string().max(500) }), raw);
      if (!parsed.ok) return parsed;
      // Only the Leads screen's own filters are kept.
      const q = new URLSearchParams(parsed.value.query);
      const keep = new URLSearchParams([...q].filter(([k, v]) => ["q", "stage", "owner", "tag", "channel", "district", "segment", "score", "due"].includes(k) && v));
      const id = newId();
      return commit(store, async (repos) => {
        if ((await repos.leads.views(actor.personId)).length >= 12) return conflict("You have 12 saved views. Remove one first.");
        await repos.leads.addView({ id, personId: actor.personId, name: parsed.value.name, query: keep.toString() });
        return change({ id }, { actorId: actor.personId, action: "lead_view.saved", entityType: "lead_view", entityId: id, personId: actor.personId, data: { name: parsed.value.name } });
      });
    },

    async removeView(actor: Actor, viewId: string): Promise<Result<null>> {
      if (!can(actor, "leads.read")) return forbidden(DENIED);
      if (!isId(viewId)) return notFound("That view");
      return commit(store, async (repos) => {
        if (!(await repos.leads.removeView(viewId, actor.personId, clock.now()))) return notFound("That view");
        return change(null, { actorId: actor.personId, action: "lead_view.removed", entityType: "lead_view", entityId: viewId, personId: actor.personId });
      });
    },

    // ---------- auto-assign ----------

    /** Whether new leads from forms go to the active BDOs in turn, and who they are. */
    async autoAssign(actor: Actor): Promise<Result<{ on: boolean; bdos: string[]; canEdit: boolean }>> {
      if (!can(actor, "leads.read")) return forbidden(DENIED);
      const [setting, people] = await Promise.all([store.calendar.getSetting<AutoAssign>(AUTO_ASSIGN_KEY), store.people.listActive()]);
      const bdos = people.filter((p) => p.roles.includes("bdo")).map((p) => p.fullName).sort();
      return ok({ on: Boolean(setting?.on), bdos, canEdit: can(actor, "leads.write") });
    },

    async setAutoAssign(actor: Actor, on: boolean): Promise<Result<null>> {
      if (!can(actor, "leads.write")) return forbidden("Only the BDO and the owner change how leads are shared.");
      return commit(store, async (repos) => {
        const before = Boolean((await repos.calendar.getSetting<AutoAssign>(AUTO_ASSIGN_KEY))?.on);
        if (before === on) return noChange(null);
        await repos.calendar.setSetting(AUTO_ASSIGN_KEY, { on } satisfies AutoAssign, actor.personId);
        return change(null, { actorId: actor.personId, action: "setting.changed", entityType: "setting", entityId: settingId(AUTO_ASSIGN_KEY), data: { key: AUTO_ASSIGN_KEY, on } });
      });
    },

    // ---------- WhatsApp templates ----------

    async templates(actor: Actor): Promise<Result<{ templates: MessageTemplate[]; canEdit: boolean }>> {
      if (!can(actor, "leads.read")) return forbidden(DENIED);
      return ok({ templates: (await store.calendar.getSetting<MessageTemplate[]>(TEMPLATES_KEY)) ?? DEFAULT_TEMPLATES, canEdit: can(actor, "leads.write") });
    },

    async setTemplates(actor: Actor, raw: unknown): Promise<Result<MessageTemplate[]>> {
      if (!can(actor, "leads.write")) return forbidden("Only the BDO and the owner change message templates.");
      const r = raw as Record<string, unknown>;
      const next: MessageTemplate[] = [];
      for (let i = 0; i < 10; i++) {
        const name = String(r[`name${i}`] ?? "").trim().slice(0, 40);
        const text = String(r[`text${i}`] ?? "").trim().slice(0, 1000);
        if (name && text) next.push({ id: String(r[`id${i}`] || newId()).slice(0, 40), name, text });
      }
      return commit(store, async (repos) => {
        const before = (await repos.calendar.getSetting<MessageTemplate[]>(TEMPLATES_KEY)) ?? DEFAULT_TEMPLATES;
        if (JSON.stringify(before) === JSON.stringify(next)) return noChange(next);
        await repos.calendar.setSetting(TEMPLATES_KEY, next, actor.personId);
        return change(next, { actorId: actor.personId, action: "setting.changed", entityType: "setting", entityId: settingId(TEMPLATES_KEY), data: { key: TEMPLATES_KEY, count: next.length } });
      });
    },

    /**
     * The WhatsApp link for a lead with a template filled in. After switch day, the BDO's and owner's sends are noted on
     * the timeline (what was sent, not whether it was read: WhatsApp doesn't say).
     */
    async whatsapp(actor: Actor, leadId: string, templateId: string): Promise<Result<{ url: string }>> {
      if (!can(actor, "leads.read")) return forbidden(DENIED);
      if (!isId(leadId)) return notFound("That lead");
      const lead = await store.leads.find(leadId);
      if (!lead) return notFound("That lead");
      const digits = String(lead.phone ?? "").replace(/\D/g, "");
      if (digits.length < 10) return invalid("This lead has no full phone number.");
      const list = (await store.calendar.getSetting<MessageTemplate[]>(TEMPLATES_KEY)) ?? DEFAULT_TEMPLATES;
      const t = list.find((x) => x.id === templateId);
      if (!t) return notFound("That template");
      const text = fillTemplate(t.text, lead, actor.fullName);
      if (can(actor, "leads.write") && (await isLive())) {
        await commit(store, async (repos) => {
          const at = clock.now();
          await repos.leads.addActivity({ leadId: lead.id, type: "other", text: `WhatsApp (${t.name}): ${text}`, byId: actor.personId, at });
          return change(null, { actorId: actor.personId, action: "lead.whatsapp_opened", entityType: "lead", entityId: lead.id, data: { template: t.name } });
        });
      }
      return ok({ url: `https://wa.me/${digits.length === 10 ? `91${digits}` : digits}?text=${encodeURIComponent(text)}` });
    },

    async page(actor: Actor, leadId: string): Promise<Result<LeadPage>> {
      if (!can(actor, "leads.read")) return forbidden(DENIED);
      if (!isId(leadId)) return notFound("That lead");
      const lead = await store.leads.find(leadId);
      if (!lead) return notFound("That lead");
      const activities = await store.leads.activities(lead.id);
      return ok({ lead, activities: activities.map((a) => ({ ...a, text: a.text ? readableLeadText(a.text) : a.text })) });
    },
  };
}
