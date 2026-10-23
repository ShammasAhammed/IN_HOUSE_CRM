// DPDP consent (Stage 11.7): reading consent from a landing-page form. Pure: no I/O, unit-tested.

export const FORM_PURPOSE = "Be contacted about this enquiry by phone, WhatsApp or email";
const YES = new Set(["on", "yes", "y", "true", "1", "agreed", "agree", "accepted", "checked"]);
/** Field names landing pages use for a consent tick box. */
const FIELDS = ["consent", "agree", "agreed", "privacy_consent", "contact_consent", "whatsapp_consent", "terms"];

/** The consent a form gave, when it had a ticked consent box; its wording from `consent_text` when sent. */
export function formConsent(input: Record<string, unknown>): { purpose: string } | null {
  const lower = new Map(Object.entries(input).map(([k, v]) => [k.toLowerCase().trim(), v]));
  const ticked = FIELDS.some((f) => {
    const v = lower.get(f);
    return v === true || (typeof v === "string" && YES.has(v.trim().toLowerCase()));
  });
  if (!ticked) return null;
  const text = lower.get("consent_text");
  return { purpose: typeof text === "string" && text.trim() ? text.trim().slice(0, 300) : FORM_PURPOSE };
}
