// Engagements: terms, fee history, monthly periods and the daily job (D22–D28, D66–D68).
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { createClientService } from "@/services/clients";
import { createEngagementService } from "@/services/engagements";
import { actorOf, addClient, addPerson, addProjectWithTask, addService, eventsFor, fixedClock, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const at = (today: string) => createEngagementService({ store, clock: fixedClock(today) });
const ids = {} as Record<"owner" | "bdo" | "strategist" | "designer" | "accountant" | "client" | "service", string>;
const bdo = () => actorOf(ids.bdo, ["bdo"]);

const periods = (engagementId: string) =>
  db
    .select({ start: s.engagementPeriods.periodStart, base: s.engagementPeriods.baseBudgetMinutes, rollover: s.engagementPeriods.rolloverInMinutes, fee: s.engagementPeriods.feePaise, status: s.engagementPeriods.status })
    .from(s.engagementPeriods)
    .where(sql`${s.engagementPeriods.engagementId} = ${engagementId} and ${s.engagementPeriods.deletedAt} is null`)
    .orderBy(s.engagementPeriods.periodStart);

async function retainer(today = "2026-10-20", extra: Record<string, string> = {}) {
  const r = await at(today).create(bdo(), {
    clientId: ids.client,
    serviceId: ids.service,
    kind: "retainer",
    startDate: "2026-10-15",
    hoursBudget: "40",
    fee: "45,000",
    rolloverPolicy: "rollover",
    ...extra,
  });
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value.id;
}

beforeEach(async () => {
  await wipe(db);
  ids.owner = await addPerson(db, "Faisal Rahman", ["owner"]);
  ids.bdo = await addPerson(db, "Ajmal K", ["bdo"]);
  ids.strategist = await addPerson(db, "Anjali Nair", ["strategist"]);
  ids.designer = await addPerson(db, "Vishnu Prasad", ["designer"]);
  ids.accountant = await addPerson(db, "Reshma Thomas", ["accountant"]);
  ids.service = await addService(db);
  ids.client = await addClient(db, "Medcrest NEET Coaching", { strategistId: ids.strategist, members: [ids.strategist, ids.designer] });
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("starting an engagement", () => {
  it("opens this month's period, prorated from a mid-month start (D23), and records events", async () => {
    const id = await retainer();
    // 17 of 31 days: 40h → 21.9h, rounded to the quarter hour; ₹45,000 → ₹24,677.42.
    expect(await periods(id)).toEqual([{ start: "2026-10-01", base: 1320, rollover: 0, fee: 2_467_742, status: "open" }]);
    const [row] = await db.select().from(s.engagements).where(sql`${s.engagements.id} = ${id}`);
    expect(row).toMatchObject({ name: "Meta ads for admissions retainer", renewalDate: "2027-10-15", hoursBudgetMinutes: 2400, status: "active" });
    expect((await eventsFor(db, id)).map((e) => e.action)).toEqual(["engagement.created", "engagement.period_opened"]);
  });

  it("opens no period for a retainer that starts in a later month", async () => {
    const id = await retainer("2026-10-20", { startDate: "2026-11-01" });
    expect(await periods(id)).toEqual([]);
  });

  it("is only for the owner and the BDO", async () => {
    for (const [personId, role] of [[ids.strategist, "strategist"], [ids.designer, "designer"], [ids.accountant, "accountant"]] as const) {
      const r = await at("2026-10-20").create(actorOf(personId, [role]), { clientId: ids.client, serviceId: ids.service, kind: "retainer", startDate: "2026-10-01", fee: "1" });
      expect(r.ok ? "ok" : r.error.code).toBe("forbidden");
    }
  });

  it("reports form mistakes per field", async () => {
    const r = await at("2026-10-20").create(bdo(), { clientId: ids.client, serviceId: ids.service, kind: "retainer", startDate: "2026-10-01", endDate: "2026-09-01", fee: "lots", hoursBudget: "" });
    expect(!r.ok && r.error.fieldErrors).toMatchObject({ fee: ["Enter rupees, like 45,000."], endDate: ["The end can't be before the start."] });
  });
});

describe("changing terms", () => {
  it("a new hours budget changes this month's period, not closed ones", async () => {
    const id = await retainer();
    const r = await at("2026-10-20").update(bdo(), {
      engagementId: id,
      serviceId: ids.service,
      status: "active",
      startDate: "2026-10-15",
      hoursBudget: "62",
      rolloverPolicy: "rollover",
      renewalDate: "2027-10-15",
    });
    expect(r.ok).toBe(true);
    // 62h × 17/31 = 34h.
    expect((await periods(id))[0]).toMatchObject({ base: 2040 });
    const actions = (await eventsFor(db, id)).map((e) => e.action);
    expect(actions.slice(-2)).toEqual(["engagement.updated", "engagement.period_updated"]);
  });

  it("a fee from this month re-prices this month; one from next month waits; past months are closed (D66)", async () => {
    const id = await retainer();
    const svc = at("2026-10-20");
    const past = await svc.changeFee(bdo(), { engagementId: id, amount: "50,000", effectiveMonth: "2026-09" });
    expect(!past.ok && past.error.fieldErrors?.effectiveMonth).toEqual(["Pick this month or later."]);

    expect((await svc.changeFee(bdo(), { engagementId: id, amount: "60,000", effectiveMonth: "2026-11" })).ok).toBe(true);
    expect((await periods(id))[0]!.fee).toBe(2_467_742);

    // From October: the fee starts on the start date (15th), replacing the first one, and re-prices the month.
    expect((await svc.changeFee(bdo(), { engagementId: id, amount: "31,000", effectiveMonth: "2026-10" })).ok).toBe(true);
    expect((await periods(id))[0]!.fee).toBe(1_700_000);
    const fees = await store.engagements.listFees(id);
    expect(fees.map((f) => [f.effectiveFrom, f.amountPaise])).toEqual([
      ["2026-11-01", 6_000_000],
      ["2026-10-15", 3_100_000],
    ]);
  });

  it("only the owner and the BDO change fees", async () => {
    const id = await retainer();
    const r = await at("2026-10-20").changeFee(actorOf(ids.strategist, ["strategist"]), { engagementId: id, amount: "1", effectiveMonth: "2026-11" });
    expect(r.ok ? "ok" : r.error.code).toBe("forbidden");
  });

  it("reopens a month after the dates moved off it and back (no crash)", async () => {
    const id = await retainer("2026-10-20", { startDate: "2026-10-01" });
    const edit = (startDate: string) =>
      at("2026-10-20").update(bdo(), { engagementId: id, serviceId: ids.service, status: "active", startDate, hoursBudget: "40", rolloverPolicy: "rollover", renewalDate: "2027-10-01" });
    expect((await edit("2026-11-01")).ok).toBe(true);
    expect(await periods(id)).toEqual([]);
    expect((await edit("2026-10-01")).ok).toBe(true);
    expect(await periods(id)).toEqual([{ start: "2026-10-01", base: 2400, rollover: 0, fee: 4_500_000, status: "open" }]);
  });

  it("won't let the end date cut into a closed month", async () => {
    const id = await retainer("2026-10-20", { startDate: "2026-10-01" });
    await at("2026-11-02").runDaily();
    const r = await at("2026-11-02").update(bdo(), { engagementId: id, serviceId: ids.service, status: "active", startDate: "2026-10-01", endDate: "2026-10-15", hoursBudget: "40", rolloverPolicy: "rollover" });
    expect(!r.ok && r.error.fieldErrors?.endDate).toEqual(["Pick a date after the last closed month."]);
  });

  it("two fee changes for the same month at once leave one fee", async () => {
    const id = await retainer();
    const change = (amount: string) => at("2026-10-20").changeFee(bdo(), { engagementId: id, amount, effectiveMonth: "2026-11" });
    const results = await Promise.all([change("50,000"), change("55,000")]);
    expect(results.every((x) => x.ok)).toBe(true);
    expect((await store.engagements.listFees(id)).filter((f) => f.effectiveFrom === "2026-11-01")).toHaveLength(1);
  });

  it("keeps the start date once a month has closed", async () => {
    const id = await retainer();
    await at("2026-11-02").runDaily();
    const r = await at("2026-11-02").update(bdo(), { engagementId: id, serviceId: ids.service, status: "active", startDate: "2026-10-01", hoursBudget: "40" });
    expect(!r.ok && r.error.fieldErrors?.startDate).toEqual(["Months have closed, so the start is fixed."]);
  });
});

describe("the daily job", () => {
  it("closes ended months and opens the new one with rollover, and can run twice (D24)", async () => {
    const id = await retainer();
    // 10 of the prorated 22h used in October: 12h roll into November.
    await addProjectWithTask(db, ids.client, { engagementId: id, ownerId: ids.designer, loggedMinutes: 600, workDate: "2026-10-16" });
    const job = at("2026-11-01");
    expect(await job.runDaily()).toEqual({ closed: 1, opened: 1, updated: 0, errors: [] });
    expect((await eventsFor(db, id)).map((e) => e.action)).toContain("engagement.period_closed");
    expect(await job.runDaily()).toEqual({ closed: 0, opened: 0, updated: 0, errors: [] });
    expect(await periods(id)).toEqual([
      { start: "2026-10-01", base: 1320, rollover: 0, fee: 2_467_742, status: "closed" },
      { start: "2026-11-01", base: 2400, rollover: 720, fee: 4_500_000, status: "open" },
    ]);
  });

  it("opens nothing for paused retainers", async () => {
    const id = await retainer();
    await db.update(s.engagements).set({ status: "paused" }).where(sql`${s.engagements.id} = ${id}`);
    expect(await at("2026-11-01").runDaily()).toEqual({ closed: 1, opened: 0, updated: 0, errors: [] });
  });
});

describe("the engagement page", () => {
  it("shows fees to the accountant and hours to the strategist, and nothing to a designer", async () => {
    const id = await retainer();
    const svc = at("2026-10-20");
    const accountant = await svc.page(actorOf(ids.accountant, ["accountant"]), id);
    if (!accountant.ok) throw new Error(accountant.error.message);
    expect(accountant.value.engagement.feePaise).toBe(4_500_000);
    expect(accountant.value.fees).toHaveLength(1);
    expect(accountant.value.engagement.hoursBudgetMinutes).toBeUndefined();
    expect(accountant.value.burn).toBeUndefined();
    expect(accountant.value.periods[0]).toEqual({ periodStart: "2026-10-01", periodEnd: "2026-10-31", status: "open", feePaise: 2_467_742 });

    const strategist = await svc.page(actorOf(ids.strategist, ["strategist"]), id);
    if (!strategist.ok) throw new Error(strategist.error.message);
    expect(strategist.value.engagement.feePaise).toBeUndefined();
    expect(strategist.value.fees).toBeUndefined();
    expect(strategist.value.engagement.hoursBudgetMinutes).toBe(2400);
    expect(strategist.value.periods[0]!.feePaise).toBeUndefined();
    expect(strategist.value.periods[0]!.hours).toMatchObject({ baseBudgetMinutes: 1320, usedMinutes: 0 });

    const designer = await svc.page(actorOf(ids.designer, ["designer"]), id);
    expect(designer.ok ? "ok" : designer.error.code).toBe("forbidden");
  });

  it("burns a one-off job against its whole budget (D27), on the client page too", async () => {
    const r = await at("2026-10-20").create(bdo(), {
      clientId: ids.client,
      serviceId: ids.service,
      kind: "one_off",
      startDate: "2026-09-01",
      endDate: "2026-10-31",
      hoursBudget: "30",
      fee: "60000",
    });
    if (!r.ok) throw new Error(r.error.message);
    // Time in two months: a one-off counts all of it.
    await addProjectWithTask(db, ids.client, { engagementId: r.value.id, ownerId: ids.designer, loggedMinutes: 600, workDate: "2026-09-20" });
    await addProjectWithTask(db, ids.client, { engagementId: r.value.id, ownerId: ids.designer, loggedMinutes: 900, workDate: "2026-10-10" });
    const page = await at("2026-10-20").page(actorOf(ids.strategist, ["strategist"]), r.value.id);
    expect(page.ok && page.value.burn).toMatchObject({ usedMinutes: 1500, budgetMinutes: 1800, usedPercent: 83, level: "warning", daysLeft: 11 });
    expect(page.ok && page.value.periods).toEqual([]);

    const clientPage = await createClientService({ store, clock: fixedClock("2026-10-20") }).page(actorOf(ids.strategist, ["strategist"]), ids.client);
    if (!clientPage.ok) throw new Error(clientPage.error.message);
    expect(clientPage.value.engagements[0]!.burn).toMatchObject({ usedMinutes: 1500, usedPercent: 83 });
  });
});

describe("deliverables", () => {
  it("are added, changed and removed (soft) by the BDO, never by a designer", async () => {
    const id = await retainer();
    const svc = at("2026-10-20");
    const added = await svc.addDeliverable(bdo(), { engagementId: id, name: "Reels", targetCount: "12" });
    if (!added.ok) throw new Error(added.error.message);
    expect((await svc.updateDeliverable(bdo(), { deliverableId: added.value.id, name: "Reels", targetCount: "10" })).ok).toBe(true);
    const designer = await svc.removeDeliverable(actorOf(ids.designer, ["designer"]), { deliverableId: added.value.id });
    expect(designer.ok ? "ok" : designer.error.code).toBe("forbidden");
    expect(await store.engagements.listDeliverables(id)).toMatchObject([{ name: "Reels", targetCount: 10 }]);
    expect((await svc.removeDeliverable(bdo(), { deliverableId: added.value.id })).ok).toBe(true);
    expect(await store.engagements.listDeliverables(id)).toEqual([]);
    const [row] = await db.select({ deletedAt: s.deliverables.deletedAt }).from(s.deliverables);
    expect(row!.deletedAt).not.toBeNull();
    expect((await eventsFor(db, added.value.id)).map((e) => e.action)).toEqual(["deliverable.created", "deliverable.updated", "deliverable.removed"]);
  });
});
