// DPDP consent records (Stage 11.7): leads and staff, who may record and withdraw, never deleted, and consent from
// landing-page forms kept with the lead.
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createConsentService } from "@/services/consent";
import { createLeadIntakeService } from "@/services/lead-intake";
import { actorOf, addPerson, eventsFor, fixedClock, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const clock = fixedClock("2026-10-19");
const consent = createConsentService({ store, clock });
const intake = createLeadIntakeService({ store, clock, meta: { connected: false, fetchLead: async () => { throw new Error("off"); } }, secrets: {} });
let owner = "";
let hr = "";
let bdo = "";
let designer = "";
let leadId = "";

beforeEach(async () => {
  await wipe(db);
  owner = await addPerson(db, "Faisal Rahman", ["owner"]);
  hr = await addPerson(db, "Divya Suresh", ["hr"]);
  bdo = await addPerson(db, "Arjun Menon", ["bdo"]);
  designer = await addPerson(db, "Nikhil Das", ["designer"]);
  await store.leads.upsertSources([{ key: "lp1", name: "Admissions LP", url: "https://admissions.oppllo.com", channel: null, active: true, leadCount: 0, lastLeadAt: null }]);
  const r = await intake.landing("lp1", { name: "Anil Kumar", phone: "9400000002" });
  leadId = String((r.body as { id: string }).id);
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("consent for leads", () => {
  it("is recorded and withdrawn by the sales team, kept after withdrawal, with events", async () => {
    const b = actorOf(bdo, ["bdo"]);
    const r = await consent.record(b, { subjectType: "lead", subjectId: leadId, purpose: "Calls about admissions", method: "call", givenOn: "2026-10-18" });
    expect(r.ok).toBe(true);
    const id = r.ok ? r.value.id : "";
    const future = await consent.record(b, { subjectType: "lead", subjectId: leadId, purpose: "x", method: "call", givenOn: "2026-10-20" });
    expect(future.ok ? null : future.error.fieldErrors?.givenOn).toEqual(["Pick today or an earlier day."]);
    expect((await consent.withdraw(b, { consentId: id, method: "whatsapp", note: "Asked us to stop" })).ok).toBe(true);
    const again = await consent.withdraw(b, { consentId: id, method: "call" });
    expect(again.ok ? "ok" : again.error.code).toBe("conflict");
    const list = await consent.forSubject(b, "lead", leadId);
    expect(list.ok && list.value.records).toMatchObject([{ purpose: "Calls about admissions", method: "call", recordedByName: "Arjun Menon", withdrawnMethod: "whatsapp", withdrawnNote: "Asked us to stop", withdrawnByName: "Arjun Menon", canWithdraw: false }]);
    expect((await eventsFor(db, id)).map((e) => e.action)).toEqual(["consent.recorded", "consent.withdrawn"]);
  });

  it("is not for people outside sales", async () => {
    const d = await consent.forSubject(actorOf(designer, ["designer"]), "lead", leadId);
    expect(d.ok ? "ok" : d.error.code).toBe("not_found");
    const w = await consent.record(actorOf(designer, ["designer"]), { subjectType: "lead", subjectId: leadId, purpose: "x", method: "call", givenOn: "2026-10-18" });
    expect(w.ok ? "ok" : w.error.code).toBe("not_found");
  });

  it("comes with a landing-page lead when its consent box was ticked", async () => {
    const r = await intake.landing("lp1", { name: "Meera", phone: "9400000003", consent: "on", consent_text: "WhatsApp about admissions" });
    const id = String((r.body as { id: string }).id);
    const list = await consent.forSubject(actorOf(owner, ["owner"]), "lead", id);
    expect(list.ok && list.value.records).toMatchObject([{ purpose: "WhatsApp about admissions", method: "form", recordedByName: null, withdrawnAt: null }]);
    const [ev] = await db.execute<{ action: string; actor_id: string | null }>(sql`select action, actor_id from events where action = 'consent.recorded'`);
    expect(ev).toMatchObject({ action: "consent.recorded", actor_id: null });
    // The first lead had no box: nothing recorded for it.
    const none = await consent.forSubject(actorOf(owner, ["owner"]), "lead", leadId);
    expect(none.ok && none.value.records).toEqual([]);
  });
});

describe("consent for staff", () => {
  it("is kept by HR; the person sees and may withdraw their own; others don't see it", async () => {
    const h = actorOf(hr, ["hr"]);
    const r = await consent.record(h, { subjectType: "person", subjectId: designer, purpose: "Keep my HR details", method: "paper", givenOn: "2026-10-01", note: "Signed copy in the HR file" });
    expect(r.ok).toBe(true);
    const id = r.ok ? r.value.id : "";
    const self = actorOf(designer, ["designer"]);
    const mine = await consent.forSubject(self, "person", designer);
    expect(mine.ok && mine.value).toMatchObject({ canRecord: false, records: [{ canWithdraw: true }] });
    const other = await consent.forSubject(actorOf(bdo, ["bdo"]), "person", designer);
    expect(other.ok ? "ok" : other.error.code).toBe("not_found");
    const selfRecord = await consent.record(self, { subjectType: "person", subjectId: designer, purpose: "x", method: "paper", givenOn: "2026-10-01" });
    expect(selfRecord.ok ? "ok" : selfRecord.error.code).toBe("forbidden");
    expect((await consent.withdraw(self, { consentId: id, method: "email" })).ok).toBe(true);
    const counts = await consent.counts(actorOf(owner, ["owner"]));
    expect(counts.ok && counts.value).toEqual({ lead: { active: 0, withdrawn: 0 }, person: { active: 0, withdrawn: 1 }, client_contact: { active: 0, withdrawn: 0 } });
    const hrCounts = await consent.counts(h);
    expect(hrCounts.ok).toBe(false);
  });
});
