// Company and team goals (Stage 14.3): live numbers from billing, results and People; blank isn't zero; who sees what
// (private spaces, leaders only, money amounts); who may set goals and check in; supporting projects; the check-in
// reminder; space goals off track for the co-worker; the MCP tools.
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { newId } from "@/lib/id";
import { createGoalService } from "@/services/goals";
import { goalTools } from "@/services/mcp-goals";
import { actorOf, addClient, addPerson, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const clock = { today: () => "2026-10-21", now: () => new Date("2026-10-21T06:30:00Z") };
const goals = createGoalService({ store, clock });

const ids = { owner: "", strategist: "", designer: "", marketer: "", accountant: "", zenith: "", founder: "", sales: "" };
const named = (id: string, roles: Parameters<typeof actorOf>[1], fullName: string) => ({ ...actorOf(id, roles), fullName });
const owner = () => named(ids.owner, ["owner"], "Faisal Rahman");
const strategist = () => named(ids.strategist, ["strategist"], "Anjali Nair");
const designer = () => named(ids.designer, ["designer"], "Nikhil Das");
const marketer = () => named(ids.marketer, ["performance_marketer"], "Rahul Krishnan");
const accountant = () => named(ids.accountant, ["accountant"], "Joseph Varghese");
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? "ok" : r.error!.code);
function value<T>(r: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}
const goal = (over: Record<string, unknown> = {}) => ({ title: "Goal", unit: "count", target: 100, period: "year", on: "2026-10-21", ...over });

beforeEach(async () => {
  await wipe(db);
  ids.owner = await addPerson(db, "Faisal Rahman", ["owner"]);
  ids.strategist = await addPerson(db, "Anjali Nair", ["strategist"]);
  ids.designer = await addPerson(db, "Nikhil Das", ["designer"]);
  ids.marketer = await addPerson(db, "Rahul Krishnan", ["performance_marketer"]);
  ids.accountant = await addPerson(db, "Joseph Varghese", ["accountant"], { joinDate: "2026-06-01" });
  ids.zenith = await addClient(db, "Zenith IAS Academy", { strategistId: ids.strategist, members: [ids.designer] });
  ids.founder = newId();
  ids.sales = newId();
  await db.insert(s.clients).values([
    { id: ids.founder, name: "Founder office", isInternal: true, isPrivate: true, status: "active" },
    { id: ids.sales, name: "Sales", isInternal: true, status: "active" },
  ]);
  await db.insert(s.clientMembers).values([
    { clientId: ids.founder, personId: ids.designer, level: "edit" },
    { clientId: ids.founder, personId: ids.marketer, level: "view" },
    { clientId: ids.sales, personId: ids.designer, level: "manage" },
  ]);
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("live numbers", () => {
  it("revenue from billing, admissions from results (blank isn't zero), hires from People", async () => {
    const invoice = (clientId: string, invoiceDate: string, amountPaise: number) => ({ id: newId(), clientId, invoiceDate, description: "Fee", amountPaise, externalId: newId(), number: "INV", url: "https://books.zoho.in/x" });
    await db.insert(s.invoices).values([invoice(ids.zenith, "2026-05-10", 1_000_000_00), invoice(ids.zenith, "2026-03-10", 500_000_00), invoice(ids.sales, "2026-06-01", 900_000_00)]);
    const rev = value(await goals.create(owner(), goal({ title: "₹50 lakh revenue", unit: "money", target: 5_000_000_00, source: "revenue" })));
    const adm = value(await goals.create(owner(), goal({ title: "300 admissions for clients", target: 300, source: "client_admissions" })));
    const hires = value(await goals.create(owner(), goal({ title: "Hire 4 people", target: 4, source: "hires" })));
    const get = async (id: string, a = owner()) => value(await goals.get(a, id));
    expect((await get(rev.id)).current).toBe(1_000_000_00); // the space's and last year's invoices don't count
    expect((await get(rev.id)).health).toMatchObject({ level: "off_track", percent: 20 });
    expect((await get(adm.id)).current).toBeNull();
    expect((await get(adm.id)).health.level).toBe("at_risk");
    await db.insert(s.clientResults).values([{ id: newId(), clientId: ids.zenith, month: "2026-09-01", admissions: 120 }, { id: newId(), clientId: ids.zenith, month: "2026-10-01", leads: 40 }]);
    expect((await get(adm.id)).current).toBe(120);
    expect((await get(hires.id)).current).toBe(1);
    // Money amounts only with money.read; the percentage and health show to everyone.
    const hidden = await get(rev.id, designer());
    expect([hidden.target, hidden.current, hidden.amountsHidden, hidden.health.percent]).toEqual([null, null, true, 20]);
    expect((await get(rev.id, accountant())).current).toBe(1_000_000_00);
    expect(code(await goals.checkin(owner(), { goalId: rev.id, value: 5 }))).toBe("invalid"); // live: note only
  });
});

describe("who sees and changes what", () => {
  it("private spaces, leaders only, and who may set goals", async () => {
    expect(code(await goals.create(strategist(), goal({ title: "x" })))).toBe("forbidden");
    const open = value(await goals.create(owner(), goal({ title: "60 new colleges" })));
    const secret = value(await goals.create(owner(), goal({ title: "Raise funds", leadersOnly: true })));
    const space = value(await goals.create(owner(), goal({ parentId: open.id, spaceId: ids.founder, title: "Founder hires" })));
    const underSecret = value(await goals.create(strategist(), goal({ parentId: secret.id, ownerId: ids.strategist, title: "Pitch deck" })));
    expect(code(await goals.create(designer(), goal({ parentId: open.id, spaceId: ids.founder, title: "x" })))).toBe("forbidden"); // edit, not manage
    value(await goals.create(designer(), goal({ parentId: open.id, spaceId: ids.sales, title: "Sales calls" }))); // manages Sales
    expect(code(await goals.create(designer(), goal({ parentId: open.id, title: "x" })))).toBe("forbidden");

    const titles = async (a: ReturnType<typeof owner>) => {
      const d = await goals.dashboard(a);
      return [...d.company.flatMap((c) => [c.title, ...c.teams.map((t) => `  ${t.title}`)]), ...d.teams.map((t) => `? ${t.title}`)];
    };
    expect(await titles(owner())).toEqual(["60 new colleges", "  Founder hires", "  Sales calls", "Raise funds", "  Pitch deck"]);
    expect(await titles(strategist())).toEqual(["60 new colleges", "  Sales calls", "Raise funds", "  Pitch deck"]); // not in the private space
    expect(await titles(designer())).toEqual(["60 new colleges", "  Founder hires", "  Sales calls"]);
    expect(await titles(marketer())).toEqual(["60 new colleges", "  Founder hires", "  Sales calls"]);
    expect(code(await goals.get(designer(), underSecret.id))).toBe("not_found");
    expect((await goals.forSpace(strategist(), ids.founder)).map((g) => g.title)).toEqual([]);
    expect((await goals.forSpace(marketer(), ids.founder)).map((g) => g.title)).toEqual(["Founder hires"]);
    expect(code(await goals.update(strategist(), { goalId: open.id, ...goal({ title: "x" }) }))).toBe("forbidden");
    const ev = await db.execute<{ action: string }>(sql`select action from events where entity_type = 'goal'`);
    expect(ev).toHaveLength(5);
    expect(space.id).toBeTruthy();
  });

  it("check-ins: who may, a number for typed-in goals, history kept; supporting projects", async () => {
    const open = value(await goals.create(owner(), goal({ title: "60 new colleges", target: 60 })));
    const space = value(await goals.create(owner(), goal({ parentId: open.id, spaceId: ids.founder, title: "Founder hires", ownerId: ids.owner, target: 4 })));
    expect(code(await goals.checkin(designer(), { goalId: space.id, note: "no number" }))).toBe("invalid");
    value(await goals.checkin(designer(), { goalId: space.id, value: 1, note: "Video editor joined" }));
    expect(code(await goals.checkin(marketer(), { goalId: space.id, value: 2, note: "x" }))).toBe("forbidden"); // view level
    expect(code(await goals.checkin(strategist(), { goalId: space.id, value: 2, note: "x" }))).toBe("not_found");
    value(await goals.checkin(owner(), { goalId: space.id, value: 2, note: "Designer offer accepted" }));
    const g = value(await goals.get(marketer(), space.id));
    expect([g.current, g.lastCheckin?.personName, g.checkins.map((c) => c.note)]).toEqual([2, "Faisal Rahman", ["Designer offer accepted", "Video editor joined"]]);
    const money = value(await goals.create(owner(), goal({ title: "Revenue", unit: "money", target: 100 })));
    expect(code(await goals.checkin(designer(), { goalId: money.id, value: 10, note: "x" }))).toBe("forbidden");

    const projectId = newId();
    await db.insert(s.projects).values({ id: projectId, clientId: ids.zenith, name: "Admissions 2027" });
    await db.insert(s.tasks).values([
      { id: newId(), projectId, clientId: ids.zenith, title: "a", status: "done", completedAt: new Date("2026-10-01T06:00:00Z"), rank: "a0" },
      { id: newId(), projectId, clientId: ids.zenith, title: "b", status: "todo", rank: "a1" },
    ]);
    const team = value(await goals.create(strategist(), goal({ parentId: open.id, ownerId: ids.strategist, title: "Zenith growth", projectIds: [projectId] })));
    expect(value(await goals.get(strategist(), team.id)).supporting).toMatchObject({ done: 1, total: 2, percent: 50 });
  });
});

describe("nudges and tools", () => {
  it("reminder after 14 days without a check-in; space goals off track for the co-worker", async () => {
    const g = value(await goals.create(owner(), goal({ title: "Hire 4", ownerId: ids.designer, target: 4 })));
    const before = new Date("2026-10-21T00:00:00Z");
    expect(await store.goals.staleOwned(ids.designer, new Date(before.getTime() - 14 * 86_400_000))).toBe(0);
    await db.execute(sql`update goals set created_at = '2026-09-20' where id = ${g.id}`);
    expect(await store.goals.staleOwned(ids.designer, new Date(before.getTime() - 14 * 86_400_000))).toBe(1);
    value(await goals.checkin(designer(), { goalId: g.id, value: 1, note: "One" }));
    expect(await store.goals.staleOwned(ids.designer, new Date(before.getTime() - 14 * 86_400_000))).toBe(0);

    const space = value(await goals.create(owner(), goal({ parentId: g.id, spaceId: ids.founder, title: "Founder hires", target: 10 })));
    value(await goals.checkin(owner(), { goalId: space.id, value: 1, note: "slow" }));
    expect((await goals.offTrackInSpaces()).map((x) => [x.spaceId, x.title])).toEqual([[ids.founder, "Founder hires"]]);
  });

  it("MCP: list_goals, goal_details and post_goal_checkin with the person's rights", async () => {
    const rev = value(await goals.create(owner(), goal({ title: "Revenue", unit: "money", target: 5_000_000_00, ownerId: ids.owner })));
    value(await goals.create(owner(), goal({ title: "Raise funds", leadersOnly: true })));
    const run = async (a: ReturnType<typeof owner>, name: string, input: unknown) => goalTools(a, goals).find((t) => t.name === name)!.run(input);
    expect((await run(owner(), "post_goal_checkin", { goal_id: rev.id, value: "12,50,000", note: "Two new retainers" })).ok).toBe(true);
    expect(value(await goals.get(owner(), rev.id)).current).toBe(12_50_000_00);
    const forDesigner = await run(designer(), "list_goals", { period: "now" });
    expect(forDesigner.text).toContain("hidden (money)");
    expect(forDesigner.text).not.toContain("Raise funds");
    expect((await run(owner(), "list_goals", { period: "now" })).text).toContain("₹12,50,000");
    expect((await run(designer(), "post_goal_checkin", { goal_id: rev.id, value: "1", note: "x" })).ok).toBe(false);
    expect((await run(owner(), "goal_details", { goal_id: rev.id })).text).toContain("Two new retainers");
  });
});
