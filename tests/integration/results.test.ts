// Results per client (Stage 11.1): permissions, totals, Meta pre-fill and its fallback, health and the at-risk list.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { AdInsights, MetaAdInsights } from "@/repositories";
import { createAdService } from "@/services/ads";
import { createResultService } from "@/services/results";
import { actorOf, addClient, addPerson, addProjectWithTask, addRetainer, addService, eventsFor, fixedClock, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const clock = fixedClock("2026-10-15");
const insights = (since: string, leads: number, spendMinor: number, currency = "INR"): AdInsights => ({ accountName: "Zenith", currency, timeZone: "Asia/Kolkata", since, until: since.replace(/01$/, "15"), reach: 1, totals: { spendMinor, impressions: 1, clicks: 1, leads }, campaigns: [], daily: [] });
let metaAnswer: AdInsights | Error = insights("2026-10-01", 60, 1_500_000);
const meta: MetaAdInsights = {
  connected: true,
  insights: async (_account, range) => {
    if (metaAnswer instanceof Error) throw metaAnswer;
    return range === "last_month" ? insights("2026-09-01", 90, 2_000_000) : metaAnswer;
  },
};
const ads = createAdService({ store, clock, meta });
const results = createResultService({ store, clock, ads });
let owner = "";
let strategist = "";
let designer = "";
let accountant = "";
let zenith = "";
let alpha = "";

const sOf = () => actorOf(strategist, ["strategist"]);
const entry = (n: Record<string, string>) => ({ clientId: zenith, month: "2026-10", ...n });

beforeEach(async () => {
  await wipe(db);
  metaAnswer = insights("2026-10-01", 60, 1_500_000);
  owner = await addPerson(db, "Shammas Ahammed", ["owner"]);
  strategist = await addPerson(db, "Anjali Nair", ["strategist"]);
  designer = await addPerson(db, "Nikhil Das", ["designer"]);
  accountant = await addPerson(db, "Lekha Menon", ["accountant"]);
  zenith = await addClient(db, "Zenith IAS Academy", { members: [designer] });
  alpha = await addClient(db, "Alpha Nursing College");
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("results per client", () => {
  it("are entered by strategists and read by the accountant; designers neither", async () => {
    expect((await results.save(sOf(), entry({ leads: "120", spend: "45,000", callsBooked: "30", admissions: "6", targetLeads: "200", targetAdmissions: "10" }))).ok).toBe(true);
    const read = await results.forClient(actorOf(accountant, ["accountant"]), zenith);
    expect(read.ok && read.value.canEdit).toBe(false);
    const oct = read.ok ? read.value.months[0]! : null;
    expect(oct?.month).toBe("2026-10-01");
    expect(oct?.result).toMatchObject({ leads: 120, spendPaise: 4_500_000, callsBooked: 30, admissions: 6, costPerLeadPaise: 37_500, costPerAdmissionPaise: 750_000, leadToAdmissionPercent: 5, leadsSource: "manual", updatedByName: "Anjali Nair" });
    expect(read.ok && read.value.months.map((m) => m.month)).toEqual(["2026-10-01", "2026-09-01", "2026-08-01", "2026-07-01", "2026-06-01", "2026-05-01"]);

    const d = actorOf(designer, ["designer"]);
    for (const r of [await results.forClient(d, zenith), await results.save(d, entry({ leads: "1" })), await results.form(d, zenith)]) expect(r.ok ? "ok" : r.error.code).toBe("forbidden");
    const a = await results.save(actorOf(accountant, ["accountant"]), entry({ leads: "1" }));
    expect(a.ok ? "ok" : a.error.code).toBe("forbidden");
  });

  it("keep blanks apart from zero, refuse bad numbers and future months, and record each change once", async () => {
    const bad = await results.save(sOf(), entry({ leads: "-3", spend: "abc" }));
    expect(bad.ok ? null : bad.error.fieldErrors).toMatchObject({ leads: ["Enter a whole number, like 120."], spend: ["Enter rupees, like 45,000."] });
    const future = await results.save(sOf(), entry({ month: "2026-11", leads: "1" }));
    expect(future.ok).toBe(false);

    const saved = await results.save(sOf(), entry({ leads: "0", admissions: "" }));
    expect(saved.ok).toBe(true);
    const id = saved.ok ? saved.value.id : "";
    const again = await results.save(sOf(), entry({ leads: "0", admissions: "" }));
    expect(again.ok && again.value.id).toBe(id);
    expect((await results.save(sOf(), entry({ leads: "5" }))).ok).toBe(true);
    expect((await eventsFor(db, id)).map((e) => e.action)).toEqual(["client.results_saved", "client.results_saved"]);
    const r = await results.forClient(sOf(), zenith);
    expect(r.ok && r.value.months[0]!.result).toMatchObject({ leads: 5, admissions: null, costPerLeadPaise: null, leadToAdmissionPercent: null });
  });

  it("keep each client's months apart", async () => {
    await results.save(sOf(), entry({ leads: "10" }));
    await results.save(sOf(), { clientId: alpha, month: "2026-10", leads: "99" });
    await results.save(sOf(), entry({ month: "2026-09", leads: "7" }));
    const r = await results.forClient(sOf(), zenith);
    expect(r.ok && r.value.months.slice(0, 2).map((m) => m.result?.leads)).toEqual([10, 7]);
  });
});

describe("Meta pre-fill", () => {
  it("fills leads and spend when linked, marks them Meta's, and turns manual once typed over", async () => {
    await ads.link(sOf(), { clientId: zenith, accountId: "1234567890" });
    const f = await results.form(sOf(), zenith);
    expect(f.ok && f.value).toMatchObject({ month: "2026-10-01", values: { leads: 60, spendPaise: 1_500_000, admissions: null }, sources: { leads: "meta", spend: "meta" }, meta: { state: "used" } });
    const sept = await results.form(sOf(), zenith, "2026-09");
    expect(sept.ok && sept.value.values).toMatchObject({ leads: 90, spendPaise: 2_000_000 });

    await results.save(sOf(), entry({ leads: "60", spend: "15000", admissions: "3" }));
    let r = await results.forClient(sOf(), zenith);
    expect(r.ok && r.value.months[0]!.result).toMatchObject({ leadsSource: "meta", spendSource: "meta" });
    await results.save(sOf(), entry({ leads: "64", spend: "15000", admissions: "3" }));
    r = await results.forClient(sOf(), zenith);
    expect(r.ok && r.value.months[0]!.result).toMatchObject({ leads: 64, leadsSource: "manual", spendSource: "meta" });
    // What a person typed is never overwritten by Meta's numbers.
    const again = await results.form(sOf(), zenith);
    expect(again.ok && again.value.values.leads).toBe(64);
  });

  it("falls back to manual entry when not linked, older months, non-rupee accounts or Meta failing", async () => {
    let f = await results.form(sOf(), zenith);
    expect(f.ok && f.value).toMatchObject({ values: { leads: null, spendPaise: null }, sources: { leads: "manual" }, meta: { state: "not_linked" } });
    await ads.link(sOf(), { clientId: zenith, accountId: "1234567890" });
    f = await results.form(sOf(), zenith, "2026-06");
    expect(f.ok && f.value.meta.state).toBe("other_month");
    metaAnswer = new Error("token expired");
    f = await results.form(sOf(), zenith);
    expect(f.ok && f.value).toMatchObject({ values: { leads: null }, meta: { state: "error", message: "token expired" } });
    expect((await results.save(sOf(), entry({ leads: "60" }))).ok).toBe(true);
    const usd = createResultService({ store, clock, ads: createAdService({ store, clock, meta: { connected: true, insights: async () => insights("2026-10-01", 60, 1_500_000, "USD") } }) });
    await store.ads.unlink(zenith, new Date());
    await ads.link(sOf(), { clientId: zenith, accountId: "1234567890" });
    f = await usd.form(sOf(), zenith);
    expect(f.ok && f.value).toMatchObject({ values: { leads: 60 }, meta: { state: "not_inr" } });
  });
});

describe("health", () => {
  it("carries targets forward and lists slipping clients for the dashboard, worst first", async () => {
    // September had a target; nothing entered for October yet → at risk ("not entered yet").
    await results.save(sOf(), entry({ month: "2026-09", leads: "200", targetLeads: "200" }));
    // Alpha: half the month gone, 20 of 100 leads → off track.
    await results.save(sOf(), { clientId: alpha, month: "2026-10", leads: "20", targetLeads: "100" });
    const list = await results.atRisk(actorOf(owner, ["owner"]));
    expect(list.ok && list.value.map((c) => [c.clientName, c.health.level])).toEqual([
      ["Alpha Nursing College", "off_track"],
      ["Zenith IAS Academy", "at_risk"],
    ]);
    const z = await results.forClient(sOf(), zenith);
    expect(z.ok && z.value.health.reasons).toEqual(["Leads not entered yet (target 200)"]);
  });

  it("counts retainer hours over budget, only for people who may see hours", async () => {
    const service = await addService(db);
    const retainer = await addRetainer(db, zenith, service, { feePaise: 5_000_000, budgetMinutes: 600, periodStart: "2026-10-01", periodEnd: "2026-10-31" });
    await addProjectWithTask(db, zenith, { engagementId: retainer, ownerId: strategist, loggedMinutes: 720, workDate: "2026-10-05" });
    const s = await results.forClient(sOf(), zenith);
    expect(s.ok && s.value.health).toMatchObject({ level: "at_risk", reasons: ["Retainer hours at 120% of budget"] });
    const a = await results.forClient(actorOf(accountant, ["accountant"]), zenith);
    expect(a.ok && a.value.health.level).toBe("no_target");
    // The month's results are tied to the client's only retainer.
    const saved = await results.save(sOf(), entry({ leads: "1" }));
    const [row] = await store.results.list({ clientIds: [zenith], from: "2026-10-01", to: "2026-10-01" });
    expect(saved.ok && row?.engagementId).toBe(retainer);
  });
});
