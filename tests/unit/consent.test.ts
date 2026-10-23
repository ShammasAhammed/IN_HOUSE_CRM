// DPDP consent (Stage 11.7): reading a landing-page form's consent box.
import { describe, expect, it } from "vitest";
import { FORM_PURPOSE, formConsent } from "@/services/rules/consent";

describe("formConsent", () => {
  it("takes a ticked box under the usual names, with the form's own wording when sent", () => {
    expect(formConsent({ consent: "on" })).toEqual({ purpose: FORM_PURPOSE });
    expect(formConsent({ Consent: "Yes" })).toEqual({ purpose: FORM_PURPOSE });
    expect(formConsent({ whatsapp_consent: true, consent_text: "  WhatsApp updates about admissions  " })).toEqual({ purpose: "WhatsApp updates about admissions" });
    expect(formConsent({ agree: "1", consent_text: "x".repeat(400) })?.purpose).toHaveLength(300);
  });

  it("is nothing without a ticked box", () => {
    expect(formConsent({ name: "Anil" })).toBeNull();
    expect(formConsent({ consent: "" })).toBeNull();
    expect(formConsent({ consent: "no" })).toBeNull();
    expect(formConsent({ consent: false })).toBeNull();
    expect(formConsent({ consent_text: "I agree" })).toBeNull();
  });
});
