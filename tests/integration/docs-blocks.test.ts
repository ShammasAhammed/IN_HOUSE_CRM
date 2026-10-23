// Docs upgrade (Stage 13.4): old pages and versions unchanged; search finds database-table rows; tables follow the
// page's rights (private spaces, 14.2 levels); @mentions reach only people who can open the page; task and client
// chips show only what the viewer may open; pictures go through storage.
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPostgresStorage } from "@/adapters/postgres";
import * as s from "@/db/schema";
import { newId } from "@/lib/id";
import { createDocTablesService } from "@/services/doc-tables";
import { createDocService } from "@/services/docs";
import { createSearchService } from "@/services/search";
import { actorOf, addClient, addPerson, addProjectWithTask, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const storage = createPostgresStorage(process.env.DATABASE_URL_TEST!, { signLink: ({ fileId }) => `/api/files/${fileId}` });
const clock = { today: () => "2026-10-21", now: () => new Date("2026-10-21T06:30:00Z") };
const docs = createDocService({ store, clock, storage });
const tables = createDocTablesService({ store, clock, docs });

const ids = { owner: "", strategist: "", designer: "", marketer: "", intern: "", zenith: "", founder: "" };
const named = (id: string, roles: Parameters<typeof actorOf>[1], fullName: string) => ({ ...actorOf(id, roles), fullName });
const owner = () => named(ids.owner, ["owner"], "Faisal Rahman");
const strategist = () => named(ids.strategist, ["strategist"], "Anjali Nair");
const designer = () => named(ids.designer, ["designer"], "Nikhil Das");
const marketer = () => named(ids.marketer, ["performance_marketer"], "Rahul Krishnan");
const intern = () => named(ids.intern, ["intern"], "Arun Babu");
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? "ok" : r.error!.code);
function value<T>(r: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

beforeEach(async () => {
  await wipe(db);
  ids.owner = await addPerson(db, "Faisal Rahman", ["owner"]);
  ids.strategist = await addPerson(db, "Anjali Nair", ["strategist"]);
  ids.designer = await addPerson(db, "Nikhil Das", ["designer"]);
  ids.marketer = await addPerson(db, "Rahul Krishnan", ["performance_marketer"]);
  ids.intern = await addPerson(db, "Arun Babu", ["intern"]);
  ids.zenith = await addClient(db, "Zenith IAS Academy", { strategistId: ids.strategist, members: [ids.designer] });
  ids.founder = newId();
  await db.insert(s.clients).values({ id: ids.founder, name: "Founder office", isInternal: true, isPrivate: true, status: "active" });
  await db.insert(s.clientMembers).values([
    { clientId: ids.founder, personId: ids.designer, level: "edit" },
    { clientId: ids.founder, personId: ids.marketer, level: "view" },
  ]);
});

afterAll(async () => {
  await store.close();
  await client.end();
  await storage.close();
});

describe("old pages and versions", () => {
  it("a 9b.5 page saves and restores unchanged; versions stay readable", async () => {
    const oldBody = "# Onboarding\n\n- [ ] Call\n- [x] Plan\n\nSee [the board](/board).";
    const { id } = value(await docs.create(strategist(), { title: "Onboarding", body: oldBody }));
    value(await docs.update(strategist(), { docId: id, version: 1, title: "Onboarding", body: `${oldBody}\n\n:::note\nNew callout\n:::` }));
    expect(code(await docs.update(designer(), { docId: id, version: 1, title: "Late", body: "x" }))).toBe("conflict"); // stale save refused
    value(await docs.restore(strategist(), { docId: id, version: 1 }));
    expect(value(await docs.get(strategist(), id)).body).toBe(oldBody);
    expect(value(await docs.versions(strategist(), id)).map((v) => v.version)).toEqual([3, 2, 1]);
  });
});

describe("database tables", () => {
  it("follow the page: private spaces stay private, view level reads only; search finds rows", async () => {
    const { id: page } = value(await docs.create(designer(), { title: "Hiring plan", body: "", clientId: ids.founder }));
    const { id: table } = value(await tables.create(designer(), { docId: page }));
    const t = value(await tables.get(designer(), table));
    const [name, status, ownerCol] = t.table.columns as unknown as [{ id: string }, { id: string }, { id: string }];
    const row = t.rows[0]!.id;
    value(await tables.setCell(designer(), table, row, name.id, "Video editor role"));
    value(await tables.setCell(designer(), table, row, status.id, "In progress"));
    value(await tables.setCell(designer(), table, row, ownerCol.id, ids.designer));
    expect(code(await tables.setCell(designer(), table, row, status.id, "Someday"))).toBe("invalid");
    expect(code(await tables.setCell(designer(), table, row, ownerCol.id, newId()))).toBe("invalid");
    expect(value(await tables.get(marketer(), table)).canEdit).toBe(false);
    expect(code(await tables.addRow(marketer(), table))).toBe("forbidden");
    expect(code(await tables.get(strategist(), table))).toBe("not_found");
    // Search reads the table's rows (people by name), only where the page is visible.
    expect((await docs.tree(designer(), { search: "video editor role" })).nodes.map((n) => n.title)).toEqual(["Hiring plan"]);
    expect((await docs.tree(designer(), { search: "Nikhil Das" })).nodes.map((n) => n.title)).toEqual(["Hiring plan"]);
    expect((await docs.tree(strategist(), { search: "video editor role" })).nodes).toEqual([]);
    const global = value(await createSearchService({ store, clock }).search(designer(), "video editor role"));
    expect(global.docs.map((d) => d.title)).toEqual(["Hiring plan"]);
    // Views are saved for everyone; unknown columns are refused.
    value(await tables.setView(designer(), table, { kind: "board", groupBy: status.id, sort: { column: name.id, dir: "desc" }, filter: null }));
    expect(value(await tables.get(marketer(), table)).table.view).toMatchObject({ kind: "board", groupBy: status.id });
    expect(code(await tables.setView(designer(), table, { kind: "table", sort: { column: "nope", dir: "asc" } }))).toBe("invalid");
    value(await tables.addColumn(designer(), table, { name: "Budget", type: "number" }));
    expect(value(await tables.get(designer(), table)).table.columns.map((c) => c.name)).toEqual(["Name", "Status", "Owner", "Date", "Budget"]);
    const ev = await db.execute<{ action: string }>(sql`select action from events where entity_type = 'doc_table' order by occurred_at`);
    expect(ev.map((e) => e.action).slice(0, 4)).toEqual(["doc_table.created", "doc_table.cell_changed", "doc_table.cell_changed", "doc_table.cell_changed"]);
  });
});

describe("mentions", () => {
  it("only people who can open the page are told; chips show only what the viewer may open", async () => {
    const mention = (id: string, nm: string) => `@[${nm}](person:${id})`;
    const { id: secret } = value(await docs.create(designer(), { title: "Founder notes", body: `${mention(ids.marketer, "Rahul")} ${mention(ids.strategist, "Anjali")}`, clientId: ids.founder }));
    const notes = async () => (await db.execute<{ person_id: string; kind: string }>(sql`select person_id, kind from notifications where kind = 'doc.mentioned' order by person_id`)).map((n) => n.person_id);
    expect(await notes()).toEqual([ids.marketer]); // Anjali can't open a private space's page
    // Editing: only people newly mentioned hear about it.
    value(await docs.update(designer(), { docId: secret, version: 1, title: "Founder notes", body: `${mention(ids.marketer, "Rahul")} again ${mention(ids.owner, "Faisal")}` }));
    expect((await notes()).sort()).toEqual([ids.marketer, ids.owner].sort());

    const { taskId } = await addProjectWithTask(db, ids.zenith, { ownerId: ids.designer });
    const body = `Do @[](task:${taskId}) for @[](client:${ids.zenith}) and @[](client:${ids.founder}).`;
    expect(await docs.chips(designer(), body)).toEqual({ [taskId]: { label: "Task", href: `/tasks/${taskId}` }, [ids.zenith]: { label: "Zenith IAS Academy", href: `/clients/${ids.zenith}` }, [ids.founder]: { label: "Founder office", href: `/clients/${ids.founder}` } });
    expect(await docs.chips(intern(), body)).toEqual({ [taskId]: null, [ids.zenith]: null, [ids.founder]: null });
    expect((await docs.chips(strategist(), body))[ids.founder]).toBeNull();
  });
});

describe("pictures", () => {
  it("only people who may edit add them; only people who see the page read them", async () => {
    const { id: page } = value(await docs.create(designer(), { title: "Moodboard", body: "", clientId: ids.founder }));
    const png = { name: "a.png", contentType: "image/png", bytes: new Uint8Array([137, 80, 78, 71]) };
    const { src } = value(await docs.addImage(designer(), page, png));
    const fileId = src.split("/").pop()!;
    expect(Array.from(value(await docs.image(marketer(), fileId)).bytes)).toEqual([137, 80, 78, 71]);
    expect(code(await docs.image(strategist(), fileId))).toBe("not_found");
    expect(code(await docs.addImage(marketer(), page, png))).toBe("forbidden");
    expect(code(await docs.addImage(designer(), page, { ...png, contentType: "image/svg+xml" }))).toBe("invalid");
  });
});

describe("templates and comments", () => {
  it("a template fills an empty new page; typed text wins over the template", async () => {
    const { id } = value(await docs.create(strategist(), { title: "Kick-off", body: "", template: "meeting_notes" }));
    expect(value(await docs.get(strategist(), id)).body).toContain("## Action items");
    const { id: own } = value(await docs.create(strategist(), { title: "Mine", body: "My own text", template: "sop" }));
    expect(value(await docs.get(strategist(), own)).body).toBe("My own text");
    for (const t of ["client_onboarding", "sop", "campaign_brief", "monthly_review", "blank"]) expect(code(await docs.create(owner(), { title: t, body: "", template: t }))).toBe("ok");
  });

  it("comments: on quoted words, @mentions only reach people who can open the page, view level can't write, resolve", async () => {
    const { id } = value(await docs.create(designer(), { title: "Hiring", body: "Hire a video editor", clientId: ids.founder }));
    value(await docs.comment(designer(), { docId: id, quote: "video editor", body: "@Rahul Krishnan @Anjali Nair thoughts?" }));
    const told = await db.execute<{ person_id: string }>(sql`select person_id from notifications where kind = 'doc.mentioned'`);
    expect(told.map((n) => n.person_id)).toEqual([ids.marketer]);
    expect(code(await docs.comment(marketer(), { docId: id, body: "can't" }))).toBe("forbidden"); // view level
    expect(code(await docs.comment(strategist(), { docId: id, body: "x" }))).toBe("not_found");
    const [c] = value(await docs.comments(marketer(), id));
    expect([c!.quote, c!.authorName, c!.mine]).toEqual(["video editor", "Nikhil Das", false]);
    expect(code(await docs.resolveComment(marketer(), c!.id, true))).toBe("forbidden");
    value(await docs.resolveComment(designer(), c!.id, true));
    expect(value(await docs.comments(owner(), id))[0]!.resolvedAt).not.toBeNull();
    expect((await docs.mentionable(designer(), id)).map((p) => p.name).sort()).toEqual(["Faisal Rahman", "Nikhil Das", "Rahul Krishnan"]);
    // The page's author hears about others' comments on a team page.
    const { id: team } = value(await docs.create(strategist(), { title: "SOP", body: "" }));
    value(await docs.comment(designer(), { docId: team, body: "Looks good" }));
    const authorNote = await db.execute<{ person_id: string; kind: string }>(sql`select person_id, kind from notifications where kind = 'doc.comment'`);
    expect(authorNote.map((n) => n.person_id)).toEqual([ids.strategist]);
  });
});
