// The prospect CRM, read-only (crm.oppllo.com, Firebase project "oppllo-crm"; Stage 8.3, D84). Firestore's REST API
// with a service account that only has the "Cloud Datastore Viewer" role: it can read leads and nothing else, and
// this file never sends a write. The CRM app itself is never changed from Oppllo One.
import { createSign } from "node:crypto";
import type { AdConversionSettings, CrmActivityCopy, CrmLead, CrmLeadCopy, CrmSource, CrmUser } from "@/repositories";
import { LEAD_ACTIVITY_TYPES, LEAD_SCORES, LEAD_STAGES, type LeadActivityType, type LeadScore, type LeadStage } from "@/lib/types";

const TOKEN = "https://oauth2.googleapis.com/token";
type Value = {
  stringValue?: string;
  timestampValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  nullValue?: null;
  mapValue?: { fields?: Record<string, Value> };
  arrayValue?: { values?: Value[] };
};
type Doc = { name: string; fields?: Record<string, Value>; createTime?: string; updateTime?: string };

/** A Firestore value as plain JSON (timestamps as ISO strings). */
export function decode(v: Value | undefined): unknown {
  if (!v) return null;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.timestampValue !== undefined) return v.timestampValue;
  if (v.mapValue) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, decode(x)]));
  if (v.arrayValue) return (v.arrayValue.values ?? []).map(decode);
  return null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);
const int = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v) : null);
/** The CRM keeps money in rupees. */
const rupeesToPaise = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[,₹\s]/g, "")) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
};
const when = (v: unknown): Date | null => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v) : null);
const oneOfOr = <T extends string>(values: readonly T[], v: unknown, fallback: T | null): T | null => (typeof v === "string" && (values as readonly string[]).includes(v) ? (v as T) : fallback);

/** Fields that get their own column; everything else (including the landing page address) is kept as it was in `details`. */
const COLUMNS = new Set(["name", "phone", "email", "inst", "role", "district", "segment", "problem", "when", "seats", "admissions", "fee", "spend", "commission", "costPerAdmission", "stage", "score", "lostReason", "origin", "channel", "sourceName", "utm_campaign", "campaignName", "utm_source", "utm_medium", "utm_content", "utm_term", "sourceId", "ownerUid", "ownerName", "nextFollowUp", "stageChangedAt", "wonAt", "lastNoteAt", "answers", "createdAt", "updatedAt"]);

export function leadFromDoc(d: Doc): CrmLeadCopy {
  const f = Object.fromEntries(Object.entries(d.fields ?? {}).map(([k, v]) => [k, decode(v)])) as Record<string, unknown>;
  const details = Object.fromEntries(Object.entries(f).filter(([k, v]) => !COLUMNS.has(k) && v !== null && v !== ""));
  const answers = f.answers && typeof f.answers === "object" ? Object.fromEntries(Object.entries(f.answers as Record<string, unknown>).map(([k, v]) => [k, String(v ?? "")])) : null;
  const createdAt = when(f.createdAt) ?? when(d.createTime) ?? new Date(0);
  const crmId = d.name.split("/").pop()!;
  return {
    crmId,
    externalId: /^(meta|google)_[\w-]+$/.test(crmId) ? crmId : null,
    sourceKey: str(f.sourceId),
    name: str(f.name) ?? str(f.inst) ?? str(f.phone) ?? "Unnamed lead",
    phone: str(f.phone),
    email: str(f.email),
    institution: str(f.inst),
    contactRole: str(f.role),
    district: str(f.district),
    segment: str(f.segment),
    problem: str(f.problem),
    timeline: str(f.when),
    seats: int(f.seats),
    admissions: int(f.admissions),
    feePaise: rupeesToPaise(f.fee),
    spendPaise: rupeesToPaise(f.spend),
    commissionPaise: rupeesToPaise(f.commission),
    costPerAdmissionPaise: rupeesToPaise(f.costPerAdmission),
    stage: oneOfOr<LeadStage>(LEAD_STAGES, f.stage, "new")!,
    score: oneOfOr<LeadScore>(LEAD_SCORES, f.score, null),
    lostReason: str(f.lostReason),
    origin: str(f.origin),
    channel: str(f.channel),
    // The CRM names landing pages in sourceName; the page address stays in details.landing.
    landing: str(f.sourceName) ?? str(f.landing),
    campaign: str(f.campaignName) ?? str(f.utm_campaign),
    utmSource: str(f.utm_source),
    utmMedium: str(f.utm_medium),
    utmContent: str(f.utm_content),
    utmTerm: str(f.utm_term),
    ownerCrmUid: str(f.ownerUid),
    ownerName: str(f.ownerName),
    nextFollowUpAt: when(f.nextFollowUp),
    stageChangedAt: when(f.stageChangedAt),
    wonAt: when(f.wonAt),
    lastNoteAt: when(f.lastNoteAt),
    answers: answers && Object.keys(answers).length ? answers : null,
    details: Object.keys(details).length ? details : null,
    createdAt,
    updatedAt: when(f.updatedAt) ?? when(d.updateTime) ?? createdAt,
  };
}

export function activityFromDoc(d: Doc): CrmActivityCopy | null {
  // .../documents/leads/{leadId}/activities/{id}
  const parts = d.name.split("/");
  const leadCrmId = parts.at(-3);
  if (!leadCrmId || parts.at(-2) !== "activities" || parts.at(-4) !== "leads") return null;
  const f = Object.fromEntries(Object.entries(d.fields ?? {}).map(([k, v]) => [k, decode(v)])) as Record<string, unknown>;
  return {
    crmId: `${leadCrmId}/${parts.at(-1)}`,
    leadCrmId,
    type: oneOfOr<LeadActivityType>(LEAD_ACTIVITY_TYPES, f.type, "other")!,
    text: str(f.text) ?? "",
    fromStage: str(f.from),
    toStage: str(f.to),
    byCrmUid: str(f.byUid),
    byName: str(f.byName),
    at: when(f.at) ?? when(d.createTime) ?? new Date(0),
  };
}

export const OPEN_STAGES = ["new", "contacted", "audit_booked", "proposal"] as const;

export function firestoreCrm(deps: { projectId: string; clientEmail: string; privateKey: string; fetch?: typeof fetch; now?: () => number }): CrmSource {
  const http = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(deps.projectId)}/databases/(default)/documents`;
  let token: { value: string; expiresAt: number } | null = null;

  async function accessToken() {
    if (token && token.expiresAt - 60_000 > now()) return token.value;
    const iat = Math.floor(now() / 1000);
    const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const unsigned = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({ iss: deps.clientEmail, scope: "https://www.googleapis.com/auth/datastore", aud: TOKEN, iat, exp: iat + 3600 })}`;
    const sig = createSign("RSA-SHA256").update(unsigned).sign(deps.privateKey).toString("base64url");
    const res = await http(TOKEN, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` }) });
    if (!res.ok) throw new Error(`Google sign-in for the CRM failed (${res.status}): ${await res.text()}`);
    const body = (await res.json()) as { access_token: string; expires_in: number };
    token = { value: body.access_token, expiresAt: now() + body.expires_in * 1000 };
    return token.value;
  }

  async function post<T>(path: string, body: object): Promise<T> {
    const res = await http(`${base}${path}`, { method: "POST", headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`The CRM's database said ${res.status}: ${await res.text()}`);
    return (await res.json()) as T;
  }

  const stageIs = (stage: string) => ({ fieldFilter: { field: { fieldPath: "stage" }, op: "EQUAL", value: { stringValue: stage } } });
  const text = (v?: Value) => v?.stringValue?.trim() || (v?.integerValue ?? (v?.doubleValue !== undefined ? String(v.doubleValue) : null)) || null;

  /** Every document of a collection (or of every subcollection with that name), a page at a time, in name order. */
  async function all(collectionId: string, allDescendants = false): Promise<Doc[]> {
    const out: Doc[] = [];
    let after: string | null = null;
    for (;;) {
      const rows: Array<{ document?: Doc }> = await post(":runQuery", {
        structuredQuery: {
          from: [{ collectionId, allDescendants }],
          orderBy: [{ field: { fieldPath: "__name__" }, direction: "ASCENDING" }],
          ...(after ? { startAt: { values: [{ referenceValue: after }], before: false } } : {}),
          limit: 500,
        },
      });
      const docs = rows.flatMap((r) => (r.document ? [r.document] : []));
      out.push(...docs);
      if (docs.length < 500) return out;
      after = docs.at(-1)!.name;
    }
  }

  return {
    connected: true,
    async allLeads() {
      return (await all("leads")).map(leadFromDoc);
    },
    async allActivities() {
      return (await all("activities", true)).flatMap((d) => activityFromDoc(d) ?? []);
    },
    async users(): Promise<CrmUser[]> {
      return (await all("users")).map((d) => {
        const f = Object.fromEntries(Object.entries(d.fields ?? {}).map(([k, v]) => [k, decode(v)])) as Record<string, unknown>;
        return { uid: d.name.split("/").pop()!, name: str(f.name), email: str(f.email)?.toLowerCase() ?? null, role: str(f.role), active: f.active !== false };
      });
    },
    async conversionSettings(): Promise<AdConversionSettings | null> {
      const read = async (path: string) => {
        const res = await http(`${base}/${path}`, { headers: { Authorization: `Bearer ${await accessToken()}` } });
        if (res.status === 404) return {};
        if (!res.ok) throw new Error(`The CRM's database said ${res.status}: ${await res.text()}`);
        const d = (await res.json()) as Doc;
        return Object.fromEntries(Object.entries(d.fields ?? {}).map(([k, v]) => [k, decode(v)])) as Record<string, unknown>;
      };
      const [conv, meta] = await Promise.all([read("integrations/conversions"), read("integrations/meta")]);
      const raw = (conv.stages ?? null) as Record<string, { meta?: unknown; google?: unknown; value?: unknown }> | null;
      if (!raw) return null;
      const stages: AdConversionSettings["stages"] = {};
      for (const [stage, v] of Object.entries(raw)) {
        if (!(LEAD_STAGES as readonly string[]).includes(stage)) continue;
        stages[stage as LeadStage] = { meta: str(v.meta), google: str(v.google), valuePaise: rupeesToPaise(v.value) };
      }
      return { stages, metaDatasetId: str(meta.datasetId), metaTestEventCode: str(meta.testEventCode) };
    },
    async sources() {
      return (await all("sources")).map((d) => {
        const f = Object.fromEntries(Object.entries(d.fields ?? {}).map(([k, v]) => [k, decode(v)])) as Record<string, unknown>;
        return {
          key: d.name.split("/").pop()!,
          name: str(f.name) ?? "Landing page",
          url: str(f.url),
          channel: str(f.channel),
          active: f.active !== false,
          leadCount: int(f.leadCount) ?? 0,
          lastLeadAt: when(f.lastLeadAt),
        };
      });
    },
    async listWon(limit) {
      const rows = await post<Array<{ document?: { name: string; fields?: Record<string, Value> } }>>(":runQuery", { structuredQuery: { from: [{ collectionId: "leads" }], where: stageIs("won"), limit } });
      const leads: CrmLead[] = [];
      for (const r of rows) {
        if (!r.document) continue;
        const f = r.document.fields ?? {};
        leads.push({
          id: r.document.name.split("/").pop()!,
          name: text(f.name) ?? text(f.inst) ?? "Unnamed lead",
          institution: text(f.inst),
          phone: text(f.phone),
          segment: text(f.segment),
          ownerName: text(f.ownerName),
          stage: "won",
          wonAt: f.wonAt?.timestampValue ? new Date(f.wonAt.timestampValue) : null,
        });
      }
      return leads.sort((a, b) => (b.wonAt?.getTime() ?? 0) - (a.wonAt?.getTime() ?? 0));
    },
    async stageCounts() {
      const out: Record<string, number> = {};
      await Promise.all(
        [...OPEN_STAGES, "won", "lost"].map(async (stage) => {
          const [r] = await post<Array<{ result?: { aggregateFields?: { n?: Value } } }>>(":runAggregationQuery", {
            structuredAggregationQuery: { structuredQuery: { from: [{ collectionId: "leads" }], where: stageIs(stage) }, aggregations: [{ alias: "n", count: {} }] },
          });
          out[stage] = Number(r?.result?.aggregateFields?.n?.integerValue ?? 0);
        }),
      );
      return out;
    },
  };
}

/** Until the owner adds the CRM's read-only key: nothing to read, and screens say so. */
export function notConnectedCrm(): CrmSource {
  return { connected: false, listWon: async () => [], stageCounts: async () => ({}), allLeads: async () => [], allActivities: async () => [], users: async () => [], sources: async () => [], conversionSettings: async () => null };
}
