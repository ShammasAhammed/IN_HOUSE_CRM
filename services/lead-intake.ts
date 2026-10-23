// New leads arriving in Oppllo One (Stage 10a.4, D89): landing-page forms, Meta lead ads and Google lead forms. The same
// addresses and rules as the old CRM, so on switch day only the domain each one posts to changes. Callers are outside
// the team (a website, Meta, Google), so every route checks its own key or signature here.
import { createHmac, timingSafeEqual } from "node:crypto";
import { newId } from "@/lib/id";
import type { DataStore, MetaLeadAds, NewEvent, NewLeadRow } from "@/repositories";
import { change, commit, noChange } from "./change";
import type { Clock } from "./clock";
import { formConsentEvent } from "./consent";
import { formConsent } from "./rules/consent";
import { GOOGLE_COLUMNS, META_FIELDS, mapFormFields, nextInTurn, type MappedForm } from "./rules/lead-intake";

export type IntakeSecrets = {
  /** Meta app secret: signs each webhook call. */
  metaAppSecret?: string;
  /** The token typed into Meta's webhook setup, echoed back once to prove the address is ours. */
  metaVerifyToken?: string;
  /** The key typed into Google Ads' lead form webhook. */
  googleWebhookKey?: string;
};

export type IntakeReply = { status: number; body: Record<string, unknown>; redirect?: string };

const safeEqual = (a: string | null | undefined, b: string | null | undefined) => {
  const x = Buffer.from(String(a ?? ""));
  const y = Buffer.from(String(b ?? ""));
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
};
/** An https address on the same host as the landing page. */
function sameSite(target: string, page: string | null): boolean {
  try {
    const t = new URL(target);
    return t.protocol === "https:" && page !== null && t.host === new URL(page).host;
  } catch {
    return false;
  }
}

const toPaise = (rupees: number | undefined) => (rupees === undefined ? null : Math.round(rupees * 100));

function rowFrom(m: MappedForm, extra: Partial<NewLeadRow> & Pick<NewLeadRow, "origin" | "channel">): NewLeadRow {
  const { landing, utm_source, utm_medium, utm_campaign, utm_content, utm_term, score, ...clickIds } = m.texts;
  const details = Object.fromEntries(Object.entries(clickIds).filter(([, v]) => v));
  return {
    id: newId(),
    externalId: null,
    sourceKey: null,
    name: m.name ?? m.phone ?? m.email ?? "New lead",
    phone: m.phone,
    email: m.email,
    institution: m.institution,
    contactRole: m.contactRole,
    district: m.district,
    segment: m.segment,
    problem: m.problem,
    timeline: m.timeline,
    seats: m.numbers.seats !== undefined ? Math.round(m.numbers.seats) : null,
    admissions: m.numbers.admissions !== undefined ? Math.round(m.numbers.admissions) : null,
    feePaise: toPaise(m.numbers.fee),
    spendPaise: toPaise(m.numbers.spend),
    commissionPaise: toPaise(m.numbers.commission),
    costPerAdmissionPaise: toPaise(m.numbers.costPerAdmission),
    stage: "new",
    score: score === "hot" || score === "warm" || score === "cold" ? score : null,
    lostReason: null,
    landing: landing ?? null,
    campaign: utm_campaign ?? null,
    utmSource: utm_source ?? null,
    utmMedium: utm_medium ?? null,
    utmContent: utm_content ?? null,
    utmTerm: utm_term ?? null,
    ownerId: null,
    ownerName: null,
    nextFollowUpAt: null,
    stageChangedAt: null,
    wonAt: null,
    lastNoteAt: null,
    answers: Object.keys(m.answers).length ? m.answers : null,
    details: Object.keys(details).length ? details : null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...extra,
  };
}

/** Auto-assign (set on Sales → Lead sources): new leads go to the active BDOs in turn. */
export const AUTO_ASSIGN_KEY = "lead_auto_assign";
export const AUTO_ASSIGN_LAST_KEY = "lead_auto_assign_last";
export type AutoAssign = { on: boolean };

/** The last lead that couldn't be saved, shown on Sales → Lead sources so a broken token never goes unnoticed. */
export const INTAKE_ERROR_KEY = "lead_intake_last_error";
export type IntakeError = { at: string; source: string; message: string };

export function createLeadIntakeService(deps: { store: DataStore; clock: Clock; meta: MetaLeadAds; secrets: IntakeSecrets; report?: (err: unknown, context?: Record<string, unknown>) => void }) {
  const { store, clock, meta, secrets } = deps;

  /** Saves the lead with an event, once: a source sending the same lead again changes nothing. */
  async function save(row: NewLeadRow, consent: { purpose: string } | null = null): Promise<"created" | "duplicate"> {
    const at = clock.now();
    const r = await commit(store, async (repos) => {
      const outcome = await repos.leads.create({ ...row, createdAt: at, updatedAt: at }, at);
      if (outcome === "duplicate") return noChange(outcome);
      if (row.sourceKey) await repos.leads.countSourceLead(row.sourceKey, at);
      const received = { actorId: null, action: "lead.received", entityType: "lead", entityId: row.id, data: { channel: row.channel, origin: row.origin } } as const;
      // DPDP (Stage 11.7): the form's ticked consent box, kept with the lead from the moment it arrives.
      const consented: NewEvent[] = [];
      if (consent) {
        const c = { id: newId(), subjectId: row.id, purpose: consent.purpose };
        await repos.consent.add({ ...c, subjectType: "lead", method: "form", givenAt: at, note: null, recordedById: null });
        consented.push(formConsentEvent(c));
      }
      if (!(await repos.calendar.getSetting<AutoAssign>(AUTO_ASSIGN_KEY))?.on) return change(outcome, received, ...consented);
      await repos.leads.lockAutoAssign();
      const bdos = (await repos.people.listActive()).filter((p) => p.roles.includes("bdo")).map((p) => p.id).sort();
      const to = nextInTurn(bdos, await repos.calendar.getSetting<string>(AUTO_ASSIGN_LAST_KEY));
      if (!to) return change(outcome, received, ...consented);
      await repos.leads.update(row.id, { ownerId: to }, at);
      await repos.leads.addActivity({ leadId: row.id, type: "assign", text: "Assigned in turn", byId: null, at });
      await repos.calendar.setSetting(AUTO_ASSIGN_LAST_KEY, to, null);
      return change(outcome, received, { actorId: null, action: "lead.auto_assigned", entityType: "lead", entityId: row.id, data: { to, name: row.name } }, ...consented);
    });
    return r.ok ? r.value : "duplicate";
  }

  return {
    /** POST /api/lead/<key> from a landing page. */
    async landing(key: string, input: Record<string, unknown>): Promise<IntakeReply> {
      // Spam trap: people never fill hidden fields named _hp or _gotcha.
      if (input._hp || input._gotcha) return { status: 200, body: { ok: true } };
      const source = key ? await store.leads.findSource(key) : null;
      if (!source || !source.active) return { status: 404, body: { ok: false, error: "Unknown or disabled landing page key" } };
      const m = mapFormFields(input);
      if (!m.name && !m.phone && !m.email) return { status: 400, body: { ok: false, error: "Need at least a name, phone or email" } };
      const row = rowFrom(m, { origin: "landing", channel: source.channel || "Landing page", sourceKey: key });
      row.landing = source.name;
      if (m.texts.landing || source.url) row.details = { ...row.details, landing: m.texts.landing ?? source.url };
      await save(row, formConsent(input));
      // Thank-you pages only on the landing page's own site, so this address can't send people anywhere else.
      const redirect = typeof input._redirect === "string" && sameSite(input._redirect, source.url) ? input._redirect : undefined;
      return { status: 200, body: { ok: true, id: row.id }, ...(redirect ? { redirect } : {}) };
    },

    /** GET /api/meta-webhook: Meta's one-time check that the address is ours. */
    metaVerify(params: URLSearchParams): string | null {
      if (params.get("hub.mode") === "subscribe" && secrets.metaVerifyToken && safeEqual(params.get("hub.verify_token"), secrets.metaVerifyToken)) return params.get("hub.challenge") ?? "";
      return null;
    },

    /** POST /api/meta-webhook: "new lead <id>", signed with the app secret. Answers are read from Meta by the adapter. */
    async metaWebhook(raw: string, signature: string | null): Promise<IntakeReply> {
      if (!secrets.metaAppSecret) return { status: 503, body: { error: "Meta lead ads aren't set up" } };
      const expected = `sha256=${createHmac("sha256", secrets.metaAppSecret).update(raw).digest("hex")}`;
      if (!safeEqual(signature, expected)) return { status: 403, body: { error: "Bad signature" } };
      let body: { entry?: Array<{ changes?: Array<{ field?: string; value?: Record<string, unknown> }> }> };
      try {
        body = JSON.parse(raw);
      } catch {
        return { status: 400, body: { error: "Invalid JSON" } };
      }
      const results: Array<Record<string, unknown>> = [];
      for (const entry of body.entry ?? []) {
        for (const ch of entry.changes ?? []) {
          if (ch.field !== "leadgen") continue;
          const v = ch.value ?? {};
          const leadgenId = String(v.leadgen_id ?? "").replace(/[^\w-]/g, "");
          if (!leadgenId) continue;
          try {
            const d = await meta.fetchLead(leadgenId, v.page_id ? String(v.page_id) : null);
            const m = mapFormFields({});
            for (const f of d.fields) {
              const value = f.values.join(", ").trim().slice(0, 500);
              if (!value) continue;
              const key = META_FIELDS[f.name];
              if (key && key !== "numbers" && key !== "texts" && key !== "answers" && !m[key]) m[key] = value;
              else m.answers[f.name.replace(/_/g, " ").slice(0, 80)] = value;
            }
            const row = rowFrom(m, {
              origin: "meta_form",
              channel: "Meta lead form",
              externalId: `meta_${leadgenId}`,
              campaign: d.campaignName,
              utmSource: d.platform === "ig" ? "instagram" : "facebook",
              utmMedium: d.isOrganic ? "organic_lead_form" : "lead_form",
            });
            row.name = m.name ?? m.phone ?? m.email ?? "Meta lead";
            row.details = { metaLeadId: leadgenId, pageId: v.page_id ? String(v.page_id) : undefined, formId: d.formId, adId: d.adId, adName: d.adName, adsetName: d.adsetName, campaignId: d.campaignId, submittedAt: d.createdTime };
            results.push({ leadgen_id: leadgenId, result: await save(row) });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            deps.report?.(err, { where: "meta-webhook", leadgenId });
            await store.calendar.setSetting(INTAKE_ERROR_KEY, { at: clock.now().toISOString(), source: `Meta lead ${leadgenId}`, message: message.slice(0, 300) } satisfies IntakeError, null);
            results.push({ leadgen_id: leadgenId, error: "not saved" });
          }
        }
      }
      // Always 200, so Meta doesn't keep retrying a lead that already failed for a reason a retry won't fix.
      return { status: 200, body: { ok: true, results } };
    },

    /** POST /api/google-lead from a Google Ads lead form. Google sends the key in the body. */
    async googleLead(body: Record<string, unknown>): Promise<IntakeReply> {
      if (!secrets.googleWebhookKey) return { status: 503, body: { error: "Google lead forms aren't set up" } };
      if (!safeEqual(typeof body.google_key === "string" ? body.google_key : "", secrets.googleWebhookKey)) return { status: 403, body: { error: "Wrong key" } };
      const m = mapFormFields({});
      let first = "";
      let last = "";
      for (const col of (body.user_column_data as Array<Record<string, unknown>>) ?? []) {
        const value = String(col.string_value ?? "").trim().slice(0, 500);
        if (!value) continue;
        const id = String(col.column_id ?? "");
        const key = GOOGLE_COLUMNS[id];
        if (id === "FIRST_NAME") first = value;
        else if (id === "LAST_NAME") last = value;
        else if (key && key !== "numbers" && key !== "texts" && key !== "answers" && !m[key]) m[key] = value;
        else m.answers[String(col.column_name ?? id ?? "Question").slice(0, 80)] = value;
      }
      if (!m.name && (first || last)) m.name = [first, last].filter(Boolean).join(" ");
      const leadId = body.lead_id ? String(body.lead_id).replace(/[^\w-]/g, "") : null;
      const row = rowFrom(m, { origin: "google_form", channel: "Google lead form", externalId: leadId ? `google_${leadId}` : null, utmSource: "google", utmMedium: "lead_form" });
      row.name = m.name ?? m.phone ?? m.email ?? "Google lead";
      const id = (k: string) => (body[k] ? String(body[k]) : undefined);
      row.details = { gclid: id("gcl_id"), googleLeadId: leadId ?? undefined, campaignId: id("campaign_id"), adGroupId: id("adgroup_id"), adId: id("creative_id"), formId: id("form_id"), isTest: body.is_test === true || undefined };
      const result = await save(row);
      return { status: 200, body: { ok: true, ...(result === "duplicate" ? { duplicate: true } : {}) } };
    },
  };
}
