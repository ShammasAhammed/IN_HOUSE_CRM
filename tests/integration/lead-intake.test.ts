// New leads from landing pages, Meta and Google (Stage 10a.4, D89).
import { createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { MetaLeadAds } from "@/repositories";
import { createLeadIntakeService } from "@/services/lead-intake";
import { mapFormFields } from "@/services/rules/lead-intake";
import { fixedClock, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const clock = fixedClock("2026-10-15");
const meta: MetaLeadAds = {
  connected: true,
  fetchLead: async () => ({ createdTime: "2026-10-15T05:00:00+0000", fields: [{ name: "full_name", values: ["Sr. Lissy"] }, { name: "phone_number", values: ["+919400000001"] }, { name: "how_many_seats?", values: ["120"] }], adId: "a1", adName: "Ad", adsetName: "Set", campaignId: "c1", campaignName: "NEET Oct", formId: "f1", platform: "ig", isOrganic: false }),
};
const secrets = { metaAppSecret: "app-secret", metaVerifyToken: "verify-me", googleWebhookKey: "g-key" };
const intake = createLeadIntakeService({ store, clock, meta, secrets });

beforeEach(async () => {
  await wipe(db);
  await store.leads.upsertSources([{ key: "lp1", name: "Admissions LP", url: "https://admissions.oppllo.com", channel: null, active: true, leadCount: 0, lastLeadAt: null }]);
});

afterAll(async () => {
  await store.close();
  await client.end();
});

const leadsNow = async () => db.execute(sql`select name, phone, origin, channel, landing, campaign, external_id, answers, fee_paise from leads order by created_at`);

describe("landing-page forms", () => {
  it("map the usual field names, count the page and record an event", async () => {
    const r = await intake.landing("lp1", { your_name: "Anil Kumar", mobile: "9400000002", institution: "Green Valley School", fee: "45000", utm_campaign: "Admissions 2027", how_did_you_hear: "Friend", _redirect: "https://admissions.oppllo.com/thanks" });
    expect(r).toMatchObject({ status: 200, redirect: "https://admissions.oppllo.com/thanks" });
    const [l] = await leadsNow();
    expect(l).toMatchObject({ name: "Anil Kumar", phone: "9400000002", origin: "landing", channel: "Landing page", landing: "Admissions LP", campaign: "Admissions 2027", fee_paise: "4500000", answers: { how_did_you_hear: "Friend" } });
    expect(await store.leads.findSource("lp1")).toMatchObject({ leadCount: 1 });
    const [ev] = await db.execute(sql`select action from events where entity_type = 'lead'`);
    expect(ev).toMatchObject({ action: "lead.received" });
  });

  it("refuse unknown keys and empty forms, and quietly drop spam", async () => {
    expect((await intake.landing("nope", { name: "x" })).status).toBe(404);
    expect((await intake.landing("lp1", { message: "hi" })).status).toBe(400);
    expect((await intake.landing("lp1", { name: "Bot", _hp: "x" })).status).toBe(200);
    expect(await leadsNow()).toHaveLength(0);
  });
});

describe("Meta lead ads", () => {
  const body = JSON.stringify({ entry: [{ changes: [{ field: "leadgen", value: { leadgen_id: "777", page_id: "p1" } }] }] });
  const sign = (raw: string) => `sha256=${createHmac("sha256", "app-secret").update(raw).digest("hex")}`;

  it("answer Meta's check only with the right token", () => {
    expect(intake.metaVerify(new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "verify-me", "hub.challenge": "42" }))).toBe("42");
    expect(intake.metaVerify(new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "42" }))).toBeNull();
  });

  it("refuse unsigned calls, save signed ones once", async () => {
    expect((await intake.metaWebhook(body, "sha256=bad")).status).toBe(403);
    expect((await intake.metaWebhook(body, sign(body))).status).toBe(200);
    await intake.metaWebhook(body, sign(body));
    const rows = await leadsNow();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Sr. Lissy", phone: "+919400000001", origin: "meta_form", campaign: "NEET Oct", external_id: "meta_777", answers: { "how many seats?": "120" } });
  });
});

describe("Google lead forms", () => {
  const lead = { google_key: "g-key", lead_id: "abc1", gcl_id: "G-1", user_column_data: [{ column_id: "FIRST_NAME", string_value: "Haris" }, { column_id: "LAST_NAME", string_value: "Rahman" }, { column_id: "PHONE_NUMBER", string_value: "9400000003" }] };

  it("need the key, and save each lead once", async () => {
    expect((await intake.googleLead({ ...lead, google_key: "wrong" })).status).toBe(403);
    expect((await intake.googleLead(lead)).body).toEqual({ ok: true });
    expect((await intake.googleLead(lead)).body).toEqual({ ok: true, duplicate: true });
    const rows = await leadsNow();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Haris Rahman", origin: "google_form", external_id: "google_abc1" });
  });
});

describe("form field mapping", () => {
  it("joins first and last names and keeps unknown fields as answers", () => {
    const m = mapFormFields({ first_name: "Deepa", last_name: "Menon", Email: "d@x.in", seats: "60", _secret: "x", source: "y", extra: "z" });
    expect(m).toMatchObject({ name: "Deepa Menon", email: "d@x.in", numbers: { seats: 60 }, answers: { extra: "z" } });
  });
});

describe("auto-assign", () => {
  it("off: nobody; on: the active BDOs in turn, each told, also when two arrive at once", async () => {
    const { addPerson, actorOf } = await import("./harness");
    const { createLeadService } = await import("@/services/leads");
    const a = await addPerson(db, "Bdo A", ["bdo"]);
    const b = await addPerson(db, "Bdo B", ["bdo"]);
    await addPerson(db, "Gone Bdo", ["bdo"], { status: "left" });
    const owner = await addPerson(db, "Faisal Rahman", ["owner"]);
    const leads = createLeadService({ store, clock, crmConnected: false, intake: { metaReady: false, googleReady: false } });
    await intake.landing("lp1", { name: "First", mobile: "9400000011" });
    expect(await leads.setAutoAssign(actorOf(a, ["designer"]), true)).toMatchObject({ ok: false });
    expect(await leads.setAutoAssign(actorOf(owner, ["owner"]), true)).toMatchObject({ ok: true });
    await intake.landing("lp1", { name: "Second", mobile: "9400000012" });
    await Promise.all([intake.landing("lp1", { name: "Third", mobile: "9400000013" }), intake.landing("lp1", { name: "Fourth", mobile: "9400000014" })]);
    const rows = await db.execute(sql`select name, owner_id from leads order by created_at`);
    const owners = rows.map((r) => r.owner_id);
    expect(owners[0]).toBeNull();
    const [first, second] = [a, b].sort();
    expect(owners[1]).toBe(first);
    // The two that arrived together went to different people: the turn moved on under the lock.
    expect([owners[2], owners[3]].sort()).toEqual([first, second].sort());
    const notes = await db.execute(sql`select person_id from notifications where kind = 'lead.assigned'`);
    expect(notes).toHaveLength(3);
  });
});
