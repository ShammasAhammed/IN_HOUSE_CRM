// The owner dashboard (Stage 8.4).
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createCapacityService } from "@/services/capacity";
import { createDashboardService } from "@/services/dashboard";
import { createEngagementService } from "@/services/engagements";
import { actorOf, addClient, addPerson, addProjectWithTask, addRetainer, addService, fixedClock, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const clock = fixedClock("2026-10-14");
const dash = createDashboardService({ store, clock, capacity: createCapacityService({ store, clock }) });
let owner = "";
let strategist = "";

beforeEach(async () => {
  await wipe(db);
  owner = await addPerson(db, "Faisal Rahman", ["owner"]);
  strategist = await addPerson(db, "Anjali Nair", ["strategist"]);
  const c = await addClient(db, "Zenith IAS Academy");
  await addProjectWithTask(db, c, { ownerId: strategist, dueDate: "2026-10-10" });
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("the owner dashboard", () => {
  it("is the owner's, and counts what's late", async () => {
    const r = await dash.owner(actorOf(owner, ["owner"]));
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.counts).toMatchObject({ activeClients: 1, overdueTasks: 1 });
    expect(r.value.lateProjects.map((p) => p.overdueTasks)).toEqual([1]);
    const peek = await dash.owner(actorOf(strategist, ["strategist"]));
    expect(peek.ok ? "ok" : peek.error.code).toBe("forbidden");
  });

  it("shows the same burn % as the engagement page (QA S4-B3)", async () => {
    const c = await addClient(db, "TEST Burn Client");
    const retainer = await addRetainer(db, c, await addService(db), { feePaise: 1, budgetMinutes: 588, periodStart: "2026-10-01", periodEnd: "2026-10-31" });
    // 123 of 588 minutes = 20.9%: one place used to round to 21, the other to 20.
    await addProjectWithTask(db, c, { engagementId: retainer, ownerId: strategist, loggedMinutes: 123, workDate: "2026-10-13" });
    const r = await dash.owner(actorOf(owner, ["owner"]));
    const row = r.ok ? r.value.burn.find((b) => b.engagementId === retainer) : undefined;
    const page = await createEngagementService({ store, clock }).page(actorOf(owner, ["owner"]), retainer);
    if (!page.ok) throw new Error(page.error.message);
    expect(row?.usedPercent).toBe(20);
    expect(JSON.stringify(page.value)).toContain('"usedPercent":20');
  });
});
