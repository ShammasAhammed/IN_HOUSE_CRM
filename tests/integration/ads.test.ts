// Meta ad results on the client page (Stage 10.1, D92).
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { leadsOf, metaAdInsights } from "@/adapters/meta/insights";
import type { AdInsights, MetaAdInsights } from "@/repositories";
import { createAdService } from "@/services/ads";
import { actorOf, addClient, addPerson, fixedClock, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
let now = new Date("2026-10-15T06:30:00Z");
const clock = { ...fixedClock("2026-10-15"), now: () => now };
const sample: AdInsights = { accountName: "Zenith", currency: "INR", timeZone: "Asia/Kolkata", since: "2026-10-01", until: "2026-10-15", reach: 9000, totals: { spendMinor: 1_500_000, impressions: 40000, clicks: 800, leads: 60 }, campaigns: [], daily: [] };
let calls = 0;
let failing = false;
const meta: MetaAdInsights = {
  connected: true,
  insights: async () => {
    calls++;
    if (failing) throw new Error("token expired");
    return sample;
  },
};
const ads = createAdService({ store, clock, meta });
let strategist = "";
let designer = "";
let zenith = "";

beforeEach(async () => {
  await wipe(db);
  calls = 0;
  failing = false;
  now = new Date("2026-10-15T06:30:00Z");
  strategist = await addPerson(db, "Anjali Nair", ["strategist"]);
  designer = await addPerson(db, "Nikhil Das", ["designer"]);
  zenith = await addClient(db, "Zenith IAS Academy", { members: [designer] });
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("Meta ad results", () => {
  it("need a linked account, then come from Meta and are reused for a few hours", async () => {
    const s = actorOf(strategist, ["strategist"]);
    expect(await ads.forClient(s, zenith)).toEqual({ ok: true, value: { state: "not_linked", canLink: true } });
    const bad = await ads.link(s, { clientId: zenith, accountId: "abc" });
    expect(bad.ok).toBe(false);
    expect((await ads.link(s, { clientId: zenith, accountId: "act_1234567890" })).ok).toBe(true);
    const r = await ads.forClient(s, zenith);
    expect(r).toMatchObject({ ok: true, value: { state: "ok", accountId: "1234567890", range: "this_month", insights: { totals: { leads: 60 } } } });
    await ads.forClient(s, zenith);
    expect(calls).toBe(1);
    now = new Date(now.getTime() + 4 * 3600_000);
    await ads.forClient(s, zenith);
    expect(calls).toBe(2);
  });

  it("show the last numbers when Meta fails, and say so when there are none", async () => {
    const s = actorOf(strategist, ["strategist"]);
    await ads.link(s, { clientId: zenith, accountId: "1234567890" });
    failing = true;
    expect(await ads.forClient(s, zenith, "last_7d")).toMatchObject({ ok: true, value: { state: "error", message: "token expired" } });
    failing = false;
    await ads.forClient(s, zenith, "last_7d");
    failing = true;
    expect(await ads.forClient(s, zenith, "last_7d", { refresh: true })).toMatchObject({ ok: true, value: { state: "ok" } });
  });

  it("are not for designers, even on their own clients", async () => {
    const r = await ads.forClient(actorOf(designer, ["designer"]), zenith);
    expect(r.ok ? "ok" : r.error.code).toBe("forbidden");
  });
});

describe("the Meta adapter", () => {
  it("counts leads once and reads money and dates as Meta gives them", async () => {
    expect(leadsOf([{ action_type: "lead", value: "12" }, { action_type: "onsite_conversion.lead_grouped", value: "10" }, { action_type: "offsite_conversion.fb_pixel_lead", value: "2" }])).toBe(12);
    expect(leadsOf([{ action_type: "onsite_conversion.lead_grouped", value: "10" }, { action_type: "offsite_conversion.fb_pixel_lead", value: "2" }])).toBe(12);
    const urls: string[] = [];
    const fake = (async (url: string | URL) => {
      const u = String(url);
      urls.push(u);
      if (!u.includes("/insights")) return Response.json({ name: "Zenith", currency: "INR", timezone_name: "Asia/Kolkata" });
      if (u.includes("level=campaign")) return Response.json({ data: [{ campaign_id: "c1", campaign_name: "NEET", spend: "1000.50", impressions: "100", clicks: "5", actions: [{ action_type: "lead", value: "4" }] }] });
      if (u.includes("time_increment")) return Response.json({ data: [{ date_start: "2026-10-14", spend: "1000.50", actions: [] }] });
      return Response.json({ data: [{ reach: "70", spend: "1000.50", impressions: "100", clicks: "5", actions: [{ action_type: "lead", value: "4" }], date_start: "2026-10-01", date_stop: "2026-10-15" }] });
    }) as typeof fetch;
    const r = await metaAdInsights({ token: "t", fetch: fake }).insights("act_123", "this_month");
    expect(r).toMatchObject({ currency: "INR", since: "2026-10-01", reach: 70, totals: { spendMinor: 100050, leads: 4 }, campaigns: [{ name: "NEET", leads: 4 }] });
    expect(urls.every((u) => u.startsWith("https://graph.facebook.com/") && u.includes("act_123"))).toBe(true);
    expect(urls.some((u) => u.includes("date_preset=this_month"))).toBe(true);
  });
});
