// DPDP consent records (Stage 11.7): what a lead or a team member agreed to, when and how (form, call, paper…), and
// when and how they withdrew it. Records are never edited or deleted; every change is an event.
// Leads: the sales team reads, those who work leads record. Staff: HR and the owner keep them; a person sees and may
// withdraw their own (DPDP gives them that right).
import { z } from "zod";
import { isIsoDate, istInstant } from "@/lib/dates";
import { isId, newId } from "@/lib/id";
import { conflict, forbidden, invalid, notFound, ok, type Result } from "@/lib/result";
import { CONSENT_METHODS, CONSENT_SUBJECTS, type ConsentSubject } from "@/lib/types";
import { optionalText, parse } from "@/lib/validation/common";
import type { ConsentCounts, ConsentRecord, DataStore, NewEvent } from "@/repositories";
import { change, commit } from "./change";
import type { Clock } from "./clock";
import { can, type Actor } from "./permissions";

const method = z.enum(CONSENT_METHODS, { message: "Pick how it was given." });
const recordSchema = z.object({
  subjectType: z.enum(CONSENT_SUBJECTS),
  subjectId: z.uuid(),
  purpose: z.string().trim().min(1, { message: "Say what was agreed." }).max(300, { message: "Keep it under 300 characters." }),
  method,
  givenOn: z.string().refine(isIsoDate, { message: "Enter the date it was given." }),
  note: optionalText(500),
});
const withdrawSchema = z.object({ consentId: z.uuid(), method, note: optionalText(500) });

export type SubjectConsent = { records: Array<ConsentRecord & { canWithdraw: boolean }>; canRecord: boolean };

export function createConsentService(deps: { store: DataStore; clock: Clock }) {
  const { store, clock } = deps;

  /** May this person see, record and withdraw consent for this lead or person? Null when the subject isn't theirs to see. */
  async function rights(actor: Actor, subjectType: ConsentSubject, subjectId: string): Promise<{ see: boolean; record: boolean; withdraw: boolean } | null> {
    if (!isId(subjectId)) return null;
    if (subjectType === "lead") {
      if (!can(actor, "leads.read") || !(await store.leads.find(subjectId))) return null;
      const w = can(actor, "leads.write");
      return { see: true, record: w, withdraw: w };
    }
    const self = subjectId === actor.personId;
    if (!self && !can(actor, "people.private.read")) return null;
    if (!(await store.people.findById(subjectId))) return null;
    return { see: true, record: can(actor, "people.write"), withdraw: can(actor, "people.write") || self };
  }

  const event = (actor: Actor | null, action: string, r: Pick<ConsentRecord, "id" | "subjectType" | "subjectId" | "purpose" | "method">): NewEvent => ({
    actorId: actor?.personId ?? null,
    action,
    entityType: "consent_record",
    entityId: r.id,
    personId: r.subjectType === "person" ? r.subjectId : null,
    data: { subjectType: r.subjectType, subjectId: r.subjectId, purpose: r.purpose, method: r.method },
  });

  return {
    async forSubject(actor: Actor, subjectType: ConsentSubject, subjectId: string): Promise<Result<SubjectConsent>> {
      const r = await rights(actor, subjectType, subjectId);
      if (!r) return notFound(subjectType === "lead" ? "That lead" : "That person");
      const records = await store.consent.list(subjectType, subjectId);
      return ok({ records: records.map((c) => ({ ...c, canWithdraw: r.withdraw && !c.withdrawnAt })), canRecord: r.record });
    },

    async record(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      const parsed = parse(recordSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      const r = await rights(actor, v.subjectType, v.subjectId);
      if (!r) return notFound(v.subjectType === "lead" ? "That lead" : "That person");
      if (!r.record) return forbidden(v.subjectType === "lead" ? "Consent for leads is recorded by the sales team." : "Staff consent is recorded by HR and the owner.");
      if (v.givenOn > clock.today()) return invalid("Consent can't be given in the future.", { givenOn: ["Pick today or an earlier day."] });
      const id = newId();
      const row = { id, subjectType: v.subjectType, subjectId: v.subjectId, purpose: v.purpose, method: v.method, givenAt: istInstant(v.givenOn, "12:00"), note: v.note, recordedById: actor.personId };
      return commit(store, async (repos) => {
        await repos.consent.add(row);
        return change({ id }, event(actor, "consent.recorded", row));
      });
    },

    async withdraw(actor: Actor, raw: unknown): Promise<Result<null>> {
      const parsed = parse(withdrawSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      const c = await store.consent.find(v.consentId);
      const r = c ? await rights(actor, c.subjectType, c.subjectId) : null;
      if (!c || !r) return notFound("That consent record");
      if (!r.withdraw) return forbidden("You can't record a withdrawal here.");
      return commit(store, async (repos) => {
        if (!(await repos.consent.withdraw(c.id, { method: v.method, note: v.note, byId: actor.personId }, clock.now()))) return conflict("It was already withdrawn.");
        return change(null, { ...event(actor, "consent.withdrawn", c), data: { subjectType: c.subjectType, subjectId: c.subjectId, purpose: c.purpose, method: v.method } });
      });
    },

    /** Settings → Trust: how many consents are live and withdrawn (owner). */
    async counts(actor: Actor): Promise<Result<ConsentCounts>> {
      if (!can(actor, "settings.manage")) return forbidden("Only the owner sees this.");
      return ok(await store.consent.counts());
    },
  };
}

/** Inside lead intake's own commit: the consent a landing-page form gave, recorded by the system. */
export function formConsentEvent(row: { id: string; subjectId: string; purpose: string }): NewEvent {
  return { actorId: null, action: "consent.recorded", entityType: "consent_record", entityId: row.id, data: { subjectType: "lead", subjectId: row.subjectId, purpose: row.purpose, method: "form" } };
}
export type ConsentService = ReturnType<typeof createConsentService>;
