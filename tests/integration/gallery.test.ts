// Template gallery (Stage 13.6): saving boards and pages as templates cleans out client data; company vs mine;
// approval by strategists and the owner; search and tags; using a template makes a new board or page through the
// usual checks; presets and the client's brand colours.
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPostgresStorage } from "@/adapters/postgres";
import * as s from "@/db/schema";
import { newId } from "@/lib/id";
import { createBoardsService } from "@/services/boards";
import { createDocTablesService } from "@/services/doc-tables";
import { createDocService } from "@/services/docs";
import { createGalleryService } from "@/services/gallery";
import { sceneBuilder } from "@/services/rules/board-templates";
import { cardUrl } from "@/services/rules/references";
import { actorOf, addClient, addPerson, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const storage = createPostgresStorage(process.env.DATABASE_URL_TEST!, { signLink: ({ fileId }) => `/api/files/${fileId}` });
const clock = { today: () => "2026-10-21", now: () => new Date("2026-10-21T06:30:00Z") };
const boards = createBoardsService({ store, clock, storage });
const docs = createDocService({ store, clock, storage });
const docTables = createDocTablesService({ store, clock, docs });
const gallery = createGalleryService({ store, clock, boards, docs, docTables });

const ids = { owner: "", strategist: "", designer: "", marketer: "", zenith: "", mes: "", founder: "" };
const named = (id: string, roles: Parameters<typeof actorOf>[1], fullName: string) => ({ ...actorOf(id, roles), fullName });
const owner = () => named(ids.owner, ["owner"], "Faisal Rahman");
const strategist = () => named(ids.strategist, ["strategist"], "Anjali Nair");
const designer = () => named(ids.designer, ["designer"], "Nikhil Das");
const marketer = () => named(ids.marketer, ["performance_marketer"], "Rahul Krishnan");
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? "ok" : r.error!.code);
function value<T>(r: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}
const TASK = "01a15900-3bca-7097-b8f9-d0d2d4c7e3e8";

/** A Zenith board with a frame, a sticky naming the client and a date, and a live task card. */
async function zenithBoard(clientId = ids.zenith, actor = designer()) {
  let n = 0;
  const b = sceneBuilder(() => `z${++n}`);
  const f = b.frame("Zenith IAS Academy ideas", 0, 0, 800, 600);
  b.sticky("Open day at Zenith IAS Academy on 12 Nov", 20, 80, { frame: f });
  const elements = [...b.elements, b.element("embeddable", 300, 80, 320, 150, { link: cardUrl("task", TASK), customData: { card: true } })];
  return value(await boards.create(actor, { clientId, title: "Zenith Nov campaign", elements })).id;
}

beforeEach(async () => {
  await wipe(db);
  ids.owner = await addPerson(db, "Faisal Rahman", ["owner"]);
  ids.strategist = await addPerson(db, "Anjali Nair", ["strategist"]);
  ids.designer = await addPerson(db, "Nikhil Das", ["designer"]);
  ids.marketer = await addPerson(db, "Rahul Krishnan", ["performance_marketer"]);
  ids.zenith = await addClient(db, "Zenith IAS Academy", { strategistId: ids.strategist, members: [ids.designer] });
  ids.mes = await addClient(db, "MES College", { strategistId: ids.strategist, members: [ids.designer] });
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

describe("board templates", () => {
  it("save cleans client data, says what it took out, and is used in another client with the name filled in", async () => {
    const boardId = await zenithBoard();
    expect(value(await gallery.check(designer(), { boardId })).removed).toEqual(["1 live card", "2 client names", "1 date"]);
    const saved = value(await gallery.saveBoard(designer(), { boardId, name: "Open day board", tags: ["events"], scope: "company" }));
    const [row] = await db.execute<{ content: unknown }>(sql`select content from gallery_templates where id = ${saved.id}`);
    const json = JSON.stringify(row!.content);
    expect(json).not.toContain(TASK);
    expect(json).not.toContain("Zenith");
    expect(json).not.toContain("12 Nov");
    expect(json).toContain("{client}");

    const made = value(await gallery.use(strategist(), { key: saved.id, title: "MES open day", clientId: ids.mes }));
    const page = value(await boards.open(strategist(), made.id));
    expect(page.board.clientId).toBe(ids.mes);
    expect(page.items.map((i) => i.text)).toContain("Open day at MES College on [date]");
    expect(page.frames.map((f) => f.name)).toEqual(["MES College ideas"]);
    expect(page.scene.elements.some((e) => (e as { type: string }).type === "embeddable")).toBe(false);
    expect(value(await gallery.get(designer(), saved.id)).uses).toBe(1);
    const ev = await db.execute<{ action: string }>(sql`select action from events where action like 'gallery_template.%' order by occurred_at`);
    expect(ev.map((e) => e.action)).toEqual(["gallery_template.saved", "gallery_template.used"]);
  });

  it("company vs mine; approval by strategists and the owner; approved and built-in first; search and tags", async () => {
    const boardId = await zenithBoard();
    const company = value(await gallery.saveBoard(designer(), { boardId, name: "Open day board", tags: ["events"], scope: "company" }));
    const mine = value(await gallery.saveBoard(designer(), { boardId, name: "My draft", scope: "mine" }));
    const names = async (a: ReturnType<typeof designer>, f = {}) => (await gallery.list(a, { kind: "board", ...f })).filter((t) => !t.builtIn).map((t) => t.name);
    expect(await names(designer())).toEqual(["My draft", "Open day board"]); // mine before unapproved company
    expect(await names(marketer())).toEqual(["Open day board"]);
    expect(code(await gallery.approve(designer(), company.id, true))).toBe("forbidden");
    expect(code(await gallery.approve(strategist(), mine.id, true))).toBe("not_found"); // can't see it
    value(await gallery.approve(owner(), company.id, true));
    value(await gallery.approve(strategist(), company.id, false));
    value(await gallery.approve(strategist(), company.id, true));
    const all = await gallery.list(marketer(), { kind: "board" });
    expect(all.filter((t) => t.approved).map((t) => t.name)).toContain("Open day board");
    expect(all.find((t) => t.key === "builtin:board:swot")).toMatchObject({ approved: true, builtIn: true });
    expect((await gallery.list(marketer(), { q: "open day" })).map((t) => t.name)).toEqual(["Open day board"]);
    expect((await gallery.list(marketer(), { tag: "events" })).map((t) => t.name)).toEqual(["Open day board"]);
    expect(await gallery.tags(designer())).toContain("events");
    expect(code(await gallery.remove(marketer(), company.id))).toBe("forbidden");
    value(await gallery.remove(designer(), mine.id));
    expect(await names(designer())).toEqual(["Open day board"]);
    // Built-in templates are used like any other.
    const made = value(await gallery.use(designer(), { key: "builtin:board:swot", title: "SWOT", clientId: ids.mes }));
    expect(value(await boards.open(designer(), made.id)).frames).toHaveLength(4);
  });

  it("private spaces: only managers share company-wide; view level can't save; using needs edit where it lands", async () => {
    const boardId = await zenithBoard(ids.founder);
    expect(code(await gallery.saveBoard(designer(), { boardId, name: "Hiring", scope: "company" }))).toBe("forbidden");
    expect(code(await gallery.saveBoard(designer(), { boardId, name: "Hiring", scope: "mine" }))).toBe("ok");
    expect(code(await gallery.saveBoard(marketer(), { boardId, name: "Hiring", scope: "mine" }))).toBe("forbidden");
    expect(code(await gallery.saveBoard(strategist(), { boardId, name: "Hiring", scope: "mine" }))).toBe("not_found");
    expect(code(await gallery.use(marketer(), { key: "builtin:board:retro", title: "Retro", clientId: ids.founder }))).toBe("forbidden");
  });
});

describe("page templates", () => {
  it("mentions become names, rows stay behind unless chosen, tables come back with new ids", async () => {
    const { id: docId } = value(await docs.create(designer(), { title: "Zenith onboarding", body: `Ask @[Rahul Krishnan](person:${ids.marketer}) on 3 Nov.`, clientId: ids.zenith }));
    const { id: tableId } = value(await docTables.create(designer(), { docId }));
    const t = value(await docTables.get(designer(), tableId));
    value(await docTables.setCell(designer(), tableId, t.rows[0]!.id, t.table.columns[0]!.id, "Logo from Zenith IAS Academy"));
    const page = value(await docs.get(designer(), docId));
    value(await docs.update(designer(), { docId, version: page.version, title: page.title, body: `${page.body}\n\n::table[${tableId}]` }));
    expect(value(await gallery.check(designer(), { docId })).removed).toEqual(["1 date", "1 person mention (kept as a plain name)", "1 table row"]);

    const plain = value(await gallery.savePage(designer(), { docId, name: "Onboarding", scope: "mine" }));
    const madePlain = value(await gallery.use(designer(), { key: plain.id, title: "MES onboarding", clientId: ids.mes }));
    const newPage = value(await docs.get(designer(), madePlain.id));
    expect(newPage.body).toMatch(/^Ask Rahul Krishnan on \[date\]\.\n\n::table\[[0-9a-f-]{36}\]$/);
    expect(newPage.body).not.toContain(tableId);
    const [newTable] = value(await docTables.forDoc(designer(), madePlain.id));
    expect(newTable!.table.columns.map((c) => c.name)).toEqual(["Name", "Status", "Owner", "Date"]);
    expect(newTable!.rows.map((r) => r.cells)).toEqual([{}]);

    const withRows = value(await gallery.savePage(designer(), { docId, name: "Onboarding with rows", scope: "mine", keepRows: true }));
    const made = value(await gallery.use(designer(), { key: withRows.id, title: "MES onboarding 2", clientId: ids.mes }));
    const [table] = value(await docTables.forDoc(designer(), made.id));
    expect(Object.values(table!.rows[0]!.cells)).toEqual(["Logo from MES College"]);
    // Built-in page templates, and team pages.
    const sop = value(await gallery.use(marketer(), { key: "builtin:page:sop", title: "Reel SOP" }));
    expect(value(await docs.get(marketer(), sop.id)).body).toContain("## Purpose");
  });
});

describe("presets", () => {
  it("mine or company (curators only); a palette, sticky style and layout apply on use; brand colours offered", async () => {
    expect(code(await gallery.savePreset(designer(), { kind: "palette", name: "Ours", scope: "company", value: { colours: ["#112233"] } }))).toBe("forbidden");
    expect(code(await gallery.savePreset(designer(), { kind: "palette", name: "Bad", scope: "mine", value: { colours: ["red"] } }))).toBe("invalid");
    const pal = value(await gallery.savePreset(designer(), { kind: "palette", name: "Mine", scope: "mine", value: { colours: ["#112233", "#445566"] } }));
    const sty = value(await gallery.savePreset(strategist(), { kind: "sticky", name: "Clean pink", scope: "company", value: { colour: "#ffdeeb", font: "clean" } }));
    expect((await gallery.presets(marketer())).presets.map((p) => p.name)).toEqual(["Clean pink"]);
    expect((await gallery.presets(designer())).presets.map((p) => p.name).sort()).toEqual(["Clean pink", "Mine"]);

    const stickies = async (boardId: string) => (value(await boards.open(designer(), boardId)).scene.elements as Array<{ customData?: { kind?: string }; backgroundColor?: string }>).filter((e) => e.customData?.kind === "sticky").map((e) => e.backgroundColor);
    const a = value(await gallery.use(designer(), { key: "builtin:board:swot", title: "A", clientId: ids.mes, palette: pal.id }));
    expect(new Set(await stickies(a.id))).toEqual(new Set(["#112233", "#445566"]));
    const b = value(await gallery.use(designer(), { key: "builtin:board:swot", title: "B", clientId: ids.mes, sticky: sty.id }));
    expect(new Set(await stickies(b.id))).toEqual(new Set(["#ffdeeb"]));
    await db.insert(s.clientKnowledge).values({ clientId: ids.mes, brandColours: ["#0b5394"] });
    expect((await gallery.presets(designer(), ids.mes)).brand).toEqual(["#0b5394"]);
    const c = value(await gallery.use(designer(), { key: "builtin:board:swot", title: "C", clientId: ids.mes, palette: "brand" }));
    expect(new Set(await stickies(c.id))).toEqual(new Set(["#0b5394"]));
    expect(code(await gallery.removePreset(marketer(), sty.id))).toBe("forbidden");
    value(await gallery.removePreset(strategist(), sty.id));
  });
});
