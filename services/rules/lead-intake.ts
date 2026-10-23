// Turning whatever a form posted into a lead (Stage 10a.4): the same rules as the old CRM's lead intake, so landing
// pages built for the CRM work unchanged.
const clip = (v: unknown, n: number): string | null => {
  if (v === undefined || v === null) return null;
  const t = String(v).trim().slice(0, n);
  return t ? t : null;
};
const num = (v: unknown): number | null => {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** Field names other form builders commonly use. */
const ALIASES: Record<string, string[]> = {
  name: ["name", "full_name", "fullname", "your-name", "your_name", "contact_name"],
  phone: ["phone", "phone_number", "mobile", "mobile_number", "whatsapp", "whatsapp_number", "tel", "your-phone", "contact_number"],
  email: ["email", "email_address", "your-email", "e-mail"],
  institution: ["inst", "institution", "institution_name", "company", "company_name", "organisation", "organization", "school", "college"],
  contactRole: ["role", "job_title", "designation", "position"],
  district: ["district", "city", "location", "place"],
  segment: ["segment", "type", "institution_type", "business_type"],
  problem: ["problem", "message", "your-message", "comments", "requirement"],
  timeline: ["when", "start", "timeline"],
};
const NUMBERS = ["seats", "admissions", "fee", "spend", "commission", "costPerAdmission"] as const;
const TEXTS = ["score", "landing", "referrer", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "fbclid", "fbp", "fbc"] as const;

export type MappedForm = {
  name: string | null;
  phone: string | null;
  email: string | null;
  institution: string | null;
  contactRole: string | null;
  district: string | null;
  segment: string | null;
  problem: string | null;
  timeline: string | null;
  numbers: Partial<Record<(typeof NUMBERS)[number], number>>;
  texts: Partial<Record<(typeof TEXTS)[number], string>>;
  /** Everything else that was filled in (up to 30 fields). */
  answers: Record<string, string>;
};

export function mapFormFields(input: Record<string, unknown>): MappedForm {
  const lower = Object.fromEntries(Object.entries(input).map(([k, v]) => [k.toLowerCase().trim(), v]));
  const used = new Set<string>(["first_name", "last_name"]);
  const pick = (field: string, max: number) => {
    const key = ALIASES[field]!.find((k) => lower[k] !== undefined && String(lower[k]).trim() !== "");
    if (!key) return null;
    used.add(key);
    return clip(lower[key], max);
  };
  const out: MappedForm = {
    name: pick("name", 200),
    phone: pick("phone", 200),
    email: pick("email", 200),
    institution: pick("institution", 200),
    contactRole: pick("contactRole", 200),
    district: pick("district", 200),
    segment: pick("segment", 200),
    problem: pick("problem", 1000),
    timeline: pick("timeline", 200),
    numbers: {},
    texts: {},
    answers: {},
  };
  if (!out.name && (lower.first_name || lower.last_name)) out.name = clip([lower.first_name, lower.last_name].filter(Boolean).join(" "), 200);
  for (const k of NUMBERS) {
    used.add(k.toLowerCase());
    const v = num(input[k]);
    if (v !== null) out.numbers[k] = v;
  }
  for (const k of TEXTS) {
    used.add(k);
    const v = clip(input[k], 1000);
    if (v) out.texts[k] = v;
  }
  for (const [k, v] of Object.entries(input)) {
    if (used.has(k.toLowerCase().trim()) || k.startsWith("_") || k === "source" || v === "" || v === null || v === undefined) continue;
    if (Object.keys(out.answers).length >= 30) break;
    out.answers[clip(k, 80)!] = clip(typeof v === "object" ? JSON.stringify(v) : v, 500) ?? "";
  }
  return out;
}

/** Meta lead form field names. */
export const META_FIELDS: Record<string, keyof MappedForm> = {
  full_name: "name",
  phone_number: "phone",
  email: "email",
  company_name: "institution",
  job_title: "contactRole",
  city: "district",
  work_email: "email",
  work_phone_number: "phone",
};

/** Google Ads lead form column ids. */
export const GOOGLE_COLUMNS: Record<string, keyof MappedForm> = {
  FULL_NAME: "name",
  PHONE_NUMBER: "phone",
  EMAIL: "email",
  COMPANY_NAME: "institution",
  JOB_TITLE: "contactRole",
  CITY: "district",
  WORK_EMAIL: "email",
  WORK_PHONE: "phone",
};

/** What a spreadsheet column can go into when importing leads (Stage 10b). */
export const IMPORT_FIELDS = ["name", "phone", "email", "institution", "contactRole", "district", "segment", "channel", "campaign", "score", "problem", "tags", "note"] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export const MAX_IMPORT = 2000;

/** Round robin: the next person after the last one given a lead (ids in a fixed order); the first when there was none. */
export function nextInTurn(ids: readonly string[], lastId: string | null): string | null {
  if (!ids.length) return null;
  const at = lastId ? ids.indexOf(lastId) : -1;
  if (at === -1 && lastId) return ids.find((id) => id > lastId) ?? ids[0]!;
  return ids[(at + 1) % ids.length]!;
}
