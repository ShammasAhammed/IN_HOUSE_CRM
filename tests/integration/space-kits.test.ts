// Space kits (Stage 14.4): every kit makes valid, unowned records with events; applying again adds nothing; Finance,
// HR and Founder office go private and sensitive; only the owner or HR apply; the owner can change a kit.
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPostgresStorage } from "@/adapters/postgres";
import * as s from "@/db/schema";
import { newId } from "@/lib/id";
import { createBoardsService } from "@/services/boards";
import { createDocService } from "@/services/docs";
import { createGoalService } from "@/services/goals";
import { createRecurrenceService } from "@/services/recurrences";
import { KIT_KEYS, SPACE_KITS } from "@/services/rules/space-kits";
import { createSpaceKitService } from "@/services/space-kits";
import { kitTools } from "@/services/mcp-kits";
import { createSpaceService } from "@/services/spaces";
import { actorOf, addPerson, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const storage = createPostgresStorage(process.env.DATABASE_URL_TEST!, { signLink: ({ fileId }) => `/api/files/${fileId}` });
const clock = { today: () => "2026-10-21", now: () => new Date("2026-10-21T06:30:00Z") };
const kits = createSpaceKitService({ store, clock });
const goals = createGoalService({ store, clock });
const docs = createDocService({ store, clock, storage });
const boards = createBoardsService({ store, clock, storage });

const ids = { owner: "", hr: "", designer: "" };
const named = (id: string, roles: Parameters<typeof actorOf>[1], fullName: string) => ({ ...actorOf(id, roles), fullName });
const owner = () => named(ids.owner, ["owner"], "Faisal Rahman");
const hr = () => named(ids.hr, ["hr"], "Lakshmi Menon");
const designer = () => named(ids.designer, ["designer"], "Nikhil Das");
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? "ok" : r.error!.code);
function value<T>(r: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

beforeEach(async () => {
  await wipe(db);
  ids.owner = await addPerson(db, "Faisal Rahman", ["owner"]);
  ids.hr = await addPerson(db, "Lakshmi Menon", ["hr"]);
  ids.designer = await addPerson(db, "Nikhil Das", ["designer"]);
});

afterAll(async () => {
  await store.close();
  await client.end();
  await storage.close();
});

describe("each kit", () => {
  it.each(KIT_KEYS)("%s makes valid, unowned records with events, once", async (key) => {
    const kit = SPACE_KITS[key];
    const made = value(await kits.apply(owner(), { kit: key, newSpaceName: `${kit.name} team` }));
    expect(made.created).toHaveLength(kit.items.length);
    const spaceId = made.spaceId;
    const [space] = await db.execute<{ is_private: boolean; is_sensitive: boolean; is_internal: boolean }>(sql`select is_private, is_sensitive, is_internal from clients where id = ${spaceId}`);
    expect([space!.is_internal, space!.is_private, space!.is_sensitive]).toEqual([true, kit.private, kit.private]);
    // Projects with their stages, recurring rules the daily job fills, tasks, all unowned.
    const projects = await db.execute<{ id: string; lead_id: string | null; stages: number }>(sql`select p.id, p.lead_id, (select count(*)::int from project_stages s where s.project_id = p.id) as stages from projects p where p.client_id = ${spaceId}`);
    const project = kit.items.find((i) => i.kind === "project")!;
    expect(projects.map((p) => [p.lead_id, p.stages])).toEqual([[null, project.kind === "project" ? project.stages.length : 0]]);
    const recurring = kit.items.filter((i) => i.kind === "recurring").length;
    expect(Number((await db.execute<{ n: number }>(sql`select count(*)::int as n from task_recurrences where client_id = ${spaceId} and owner_id is null`))[0]!.n)).toBe(recurring);
    await createRecurrenceService({ store, clock }).runDaily();
    const tasks = await db.execute<{ owner_id: string | null }>(sql`select owner_id from tasks where client_id = ${spaceId}`);
    // The daily job makes recurring tasks shortly before they're due; one-off tasks exist at once.
    expect(tasks.length).toBeGreaterThanOrEqual(kit.items.filter((i) => i.kind === "task").length);
    expect(tasks.every((t) => t.owner_id === null)).toBe(true);
    // Docs, goals and boards open like any other.
    const docRows = await db.execute<{ id: string }>(sql`select id from docs where client_id = ${spaceId}`);
    for (const d of docRows) expect(code(await docs.get(owner(), d.id))).toBe("ok");
    expect((await goals.forSpace(owner(), spaceId)).map((g) => [g.title, g.ownerId])).toEqual(kit.items.filter((i) => i.kind === "goal").map((i) => [i.kind === "goal" ? i.title : "", null]));
    const boardRows = await db.execute<{ id: string }>(sql`select id from boards where client_id = ${spaceId}`);
    expect(boardRows).toHaveLength(kit.items.filter((i) => i.kind === "board").length);
    for (const b of boardRows) expect(value(await boards.open(owner(), b.id)).items.length).toBeGreaterThan(0);
    // Again: nothing new.
    const again = value(await kits.apply(owner(), { kit: key, spaceId }));
    expect([again.created, again.existing.length]).toEqual([[], kit.items.length]);
    const ev = await db.execute<{ action: string }>(sql`select action from events where client_id = ${spaceId} and action = 'space_kit.applied'`);
    expect(ev).toHaveLength(2);
  });
});

describe("rules", () => {
  it("a preview first, privacy said and done; only the owner or HR; only the owner makes spaces or privacy", async () => {
    const sales = newId();
    await db.insert(s.clients).values({ id: sales, name: "Money", isInternal: true, status: "active" });
    const pre = value(await kits.preview(owner(), { kit: "finance", spaceId: sales }));
    expect(pre.privacy).toContain("private and sensitive");
    expect(pre.create[0]).toBe("Project “Finance: monthly compliance and close” (stages: This month → Filed or paid → Closed)");
    expect(pre.create).toContain("Recurring task “File GSTR-1 (due by the 11th)”, on the 11th of each month");
    expect(Number((await db.execute<{ n: number }>(sql`select count(*)::int as n from projects where client_id = ${sales}`))[0]!.n)).toBe(0); // nothing yet

    expect(code(await kits.apply(designer(), { kit: "finance", spaceId: sales }))).toBe("forbidden");
    expect(code(await kits.apply(hr(), { kit: "hr", newSpaceName: "People" }))).toBe("forbidden");
    // HR applies to an existing space, but can't make it private: the preview says ask the owner.
    expect(value(await kits.preview(hr(), { kit: "finance", spaceId: sales })).notes[0]).toContain("Only the owner makes a space private");
    const byHr = value(await kits.apply(hr(), { kit: "finance", spaceId: sales }));
    expect(byHr.privacy).toBeNull();
    expect((await db.execute<{ is_private: boolean }>(sql`select is_private from clients where id = ${sales}`))[0]!.is_private).toBe(false);
    const byOwner = value(await kits.apply(owner(), { kit: "finance", spaceId: sales }));
    expect([byOwner.created, byOwner.privacy]).toEqual([[], "Made private and sensitive."]);
    expect(code(await kits.apply(owner(), { kit: "sales", newSpaceName: "Money" }))).toBe("invalid"); // name taken
  });

  it("the owner changes a kit: items left out, another day, a goal target", async () => {
    expect(code(await kits.setOverrides(hr(), "finance", { off: ["expenses"] }))).toBe("forbidden");
    expect(code(await kits.setOverrides(owner(), "finance", { days: { gstr1: 30 } }))).toBe("invalid");
    value(await kits.setOverrides(owner(), "finance", { off: ["expenses"], days: { gstr1: 13 }, targets: { collections: 90 } }));
    const made = value(await kits.apply(owner(), { kit: "finance", newSpaceName: "Finance" }));
    expect(made.created).not.toContain("Recurring task “Expense review”, on the 5th of each month");
    const [r] = await db.execute<{ day_of_month: number }>(sql`select day_of_month from task_recurrences where title like 'File GSTR-1%'`);
    expect(r!.day_of_month).toBe(13);
    const [g] = await db.execute<{ target: string }>(sql`select target from goals where title like 'Collections%'`);
    expect(Number(g!.target)).toBe(90);
    expect((await kits.list(owner())).find((k) => k.key === "finance")!.appliedTo.map((x) => x.name)).toEqual(["Finance"]);
    expect((await kits.list(designer())).find((k) => k.key === "finance")!.appliedTo).toEqual([]); // private
  });

  it("MCP: list kits; apply previews first, makes only with confirm; owner or HR only", async () => {
    const run = async (a: ReturnType<typeof owner>, name: string, input: unknown) => kitTools(a, { spaceKits: kits, spaces: createSpaceService({ store, clock }) }).find((t) => t.name === name)!.run(input);
    expect((await run(designer(), "list_space_kits", {})).text).toContain("GSTR-1");
    const pre = await run(owner(), "apply_space_kit", { kit: "sales", space: "", new_space_name: "Sales", confirm: false });
    expect(pre.text).toContain('"preview":true');
    expect(Number((await db.execute<{ n: number }>(sql`select count(*)::int as n from clients where name = 'Sales'`))[0]!.n)).toBe(0);
    const done = await run(owner(), "apply_space_kit", { kit: "sales", space: "", new_space_name: "Sales", confirm: true });
    expect(done.text).toContain('"done":true');
    const again = await run(hr(), "apply_space_kit", { kit: "sales", space: "Sales", new_space_name: "", confirm: false });
    expect(again.text).toContain('"will_make":[]');
    expect((await run(designer(), "apply_space_kit", { kit: "sales", space: "Sales", new_space_name: "", confirm: true })).ok).toBe(false);
  });
});
