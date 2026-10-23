// Results back to the ad platforms (Stage 10a.5, D90).
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { newId } from "@/lib/id";
import type { MetaConversions } from "@/repositories";
import { createConversionService, normalPhone } from "@/services/conversions";
import { actorOf, addPerson, fixedClock, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const clock = fixedClock("2026-10-15");
const sent: Array<{ dataset: string; event: Record<string, unknown> }> = [];
const meta: MetaConversions = { connected: true, send: async (dataset, event) => (sent.push({ dataset, event }), { ok: true, message: "sent" }) };
const conv = createConversionService({ store, clock, meta, googleUploadKey: "upload-key" });
let owner = "";
let leadId = "";
let oldLeadId = "";

beforeEach(async () => {
  await wipe(db);
  sent.length = 0;
  owner = await addPerson(db, "Faisal Rahman", ["owner"]);
  leadId = newId();
  oldLeadId = newId();
  await db.insert(s.leads).values([
    { id: leadId, name: "Lead", phone: "94000 00001", email: " A@B.in ", stage: "won", details: { gclid: "G-123", metaLeadId: "777" } },
    { id: oldLeadId, crmId: "abc", name: "Old", stage: "won", details: { gclid: "G-9", conversions: { won: { meta: "sent" } } } },
  ]);
  const r = await conv.setSettings(actorOf(owner, ["owner"]), { metaDatasetId: "ds1", won_meta: "Converted", won_google: "CRM Won", won_value: "50,000", audit_booked_google: "CRM Qualified Lead" });
  if (!r.ok) throw new Error(r.error.message);
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("reporting results to the ads", () => {
  it("tells Meta with hashed contact details, queues Google, and does each stage once", async () => {
    expect(await conv.onStage(leadId, "won")).toEqual({ meta: "sent", google: "queued" });
    expect(sent).toHaveLength(1);
    const user = sent[0]!.event.user_data as Record<string, unknown>;
    expect(user.lead_id).toBe("777");
    expect(user.ph).toHaveLength(1);
    expect(JSON.stringify(sent[0]!.event)).not.toContain("94000");
    expect(sent[0]!.event.custom_data).toMatchObject({ value: 50000, currency: "INR" });
    expect(await conv.onStage(leadId, "won")).toBeNull();
    expect(sent).toHaveLength(1);
    const [act] = await db.execute(sql`select text from lead_activities where lead_id = ${leadId}`);
    expect(act!.text).toBe("Ad platforms (won): Meta: sent · Google: queued");
  });

  it("skips stages the CRM already reported, and stages with nothing set", async () => {
    expect(await conv.onStage(oldLeadId, "won")).toBeNull();
    expect(await conv.onStage(leadId, "contacted")).toBeNull();
    expect(sent).toHaveLength(0);
  });

  it("serves Google's CSV only with the key", async () => {
    await conv.onStage(leadId, "won");
    expect(await conv.googleCsv("wrong")).toBeNull();
    const csv = (await conv.googleCsv("upload-key"))!;
    expect(csv.split("\n")).toEqual(["Parameters:TimeZone=Asia/Kolkata", "Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency", "G-123,CRM Won,2026-10-15 12:00:00,50000,INR", ""]);
  });

  it("are set by the owner only", async () => {
    const r = await conv.settings(actorOf(owner, ["bdo"]));
    expect(r.ok ? "ok" : r.error.code).toBe("forbidden");
    expect(normalPhone("094000 00001")).toBe("919400000001");
  });
});
