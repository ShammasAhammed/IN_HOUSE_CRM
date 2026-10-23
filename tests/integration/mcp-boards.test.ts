// Boards and templates through the MCP (Stage 13.6): the person's own rights (14.2 levels, private spaces), caps,
// and an event for every change. No AI key needed.
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPostgresStorage } from "@/adapters/postgres";
import * as s from "@/db/schema";
import { newId } from "@/lib/id";
import { createBoardsService } from "@/services/boards";
import { createDocTablesService } from "@/services/doc-tables";
import { createDocService } from "@/services/docs";
import { createGalleryService } from "@/services/gallery";
import { boardTools } from "@/services/mcp-boards";
import { mapsOn } from "@/services/rules/mind-map";
import { actorOf, addClient, addPerson, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const storage = createPostgresStorage(process.env.DATABASE_URL_TEST!, { signLink: ({ fileId }) => `/api/files/${fileId}` });
const clock = { today: () => "2026-10-21", now: () => new Date("2026-10-21T06:30:00Z") };
const boards = createBoardsService({ store, clock, storage });
const docs = createDocService({ store, clock, storage });
const gallery = createGalleryService({ store, clock, boards, docs, docTables: createDocTablesService({ store, clock, docs }) });

const ids = { strategist: "", designer: "", marketer: "", mes: "", founder: "" };
const named = (id: string, roles: Parameters<typeof actorOf>[1], fullName: string) => ({ ...actorOf(id, roles), fullName });
const strategist = () => named(ids.strategist, ["strategist"], "Anjali Nair");
const designer = () => named(ids.designer, ["designer"], "Nikhil Das");
const marketer = () => named(ids.marketer, ["performance_marketer"], "Rahul Krishnan");
async function run(actor: ReturnType<typeof designer>, name: string, input: unknown) {
  const t = boardTools(actor, { boards, gallery }).find((x) => x.name === name);
  if (!t) throw new Error(`no tool ${name}`);
  return t.run(input);
}
const json = (t: string) => JSON.parse(t) as Record<string, unknown>;

beforeEach(async () => {
  await wipe(db);
  ids.strategist = await addPerson(db, "Anjali Nair", ["strategist"]);
  ids.designer = await addPerson(db, "Nikhil Das", ["designer"]);
  ids.marketer = await addPerson(db, "Rahul Krishnan", ["performance_marketer"]);
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

describe("board tools", () => {
  it("create a board from a template, add stickies into a frame, a mind map and a section, read it back", async () => {
    const made = await run(designer(), "create_board", { client: "MES", project_id: "", title: "MES College November campaign", template_key: "builtin:board:swot" });
    expect(made.ok).toBe(true);
    const boardId = json(made.text).board_id as string;
    expect((await run(designer(), "add_stickies", { board_id: boardId, stickies: ["Strong alumni", "Big campus"], colour: "green", into: "strengths" })).ok).toBe(true);
    expect((await run(designer(), "add_stickies", { board_id: boardId, stickies: ["x"], colour: "", into: "Nowhere" })).text).toContain('no frame or section called "Nowhere"');
    const map = await run(designer(), "create_mind_map", { board_id: boardId, outline: "- November campaign\n  - Audience\n    - Parents\n    - Students\n  - Channels\n    - Meta\n    - WhatsApp", tree_json: "", title: "", layout: "down" });
    expect(map.text).toContain("Mind map with 7 ideas added (down)");
    expect((await run(designer(), "create_mind_map", { board_id: boardId, outline: "", tree_json: '{"text":"Offers","children":[{"text":"Scholarship"},{"text":"Early bird"}]}', title: "", layout: "radial" })).ok).toBe(true);
    expect((await run(designer(), "add_section", { board_id: boardId, name: "Week 1", colour: "", stickies: ["Teaser reel", "Open day post"] })).ok).toBe(true);
    const read = json((await run(marketer(), "read_board", { board_id: boardId })).text.replace(/^/, "")) as { frames: Array<{ name: string; items: string[] }>; sections: Array<{ path: string; items: string[] }>; mindMaps: string[] };
    expect(read.frames.find((f) => f.name === "Strengths")!.items).toEqual(["Add a strength", "Strong alumni", "Big campus"]);
    expect(read.sections).toEqual([{ path: "Week 1", items: ["Teaser reel", "Open day post"] }]);
    expect(read.mindMaps[0]).toContain("- November campaign\n  - Audience\n    - Parents");
    const scene = value(await boards.open(designer(), boardId)).scene.elements;
    expect([...mapsOn(scene).values()].map((t) => t.layout).sort()).toEqual(["down", "radial"]);
    const ev = await db.execute<{ action: string }>(sql`select action from events where entity_type = 'board' and action not in ('board.saved') order by occurred_at`);
    expect(ev.map((e) => e.action)).toEqual(["board.created", "gallery_template.used", "board.stickies_added", "board.mind_map_added", "board.mind_map_added", "board.section_added"]);
    expect((await run(designer(), "list_boards", { client: "MES College", search: "parents" })).text).toContain("MES College November campaign");
  });

  it("view level can't change; private spaces stay private; caps", async () => {
    const made = json((await run(designer(), "create_board", { client: "Founder office", project_id: "", title: "Hiring ideas", template_key: "" })).text);
    const boardId = made.board_id as string;
    expect((await run(marketer(), "add_stickies", { board_id: boardId, stickies: ["x"], colour: "", into: "" })).text).toContain("but not draw on this board");
    expect((await run(marketer(), "create_board", { client: "Founder office", project_id: "", title: "x", template_key: "" })).text).toContain("edit access");
    expect((await run(strategist(), "read_board", { board_id: boardId })).ok).toBe(false);
    expect((await run(strategist(), "list_boards", { client: "", search: "" })).text).not.toContain("Hiring ideas");
    expect((await run(designer(), "add_stickies", { board_id: boardId, stickies: Array.from({ length: 301 }, (_, i) => `s${i}`), colour: "", into: "" })).text).toContain("Input not understood");
    const big = `- Root\n${Array.from({ length: 300 }, (_, i) => `  - idea ${i}`).join("\n")}`;
    expect((await run(designer(), "create_mind_map", { board_id: boardId, outline: big, tree_json: "", title: "", layout: "right" })).text).toContain("up to 300");
    expect((await run(designer(), "create_mind_map", { board_id: boardId, outline: "", tree_json: "{bad", title: "", layout: "right" })).text).toContain("isn't valid JSON");
  });

  it("templates: list, save (what was taken out), use for a page, scope and approval", async () => {
    const boardId = json((await run(designer(), "create_board", { client: "MES", project_id: "", title: "MES College open day", template_key: "" })).text).board_id as string;
    await run(designer(), "add_stickies", { board_id: boardId, stickies: ["MES College open day on 12 Nov"], colour: "", into: "" });
    const saved = json((await run(designer(), "save_as_template", { kind: "board", id: boardId, name: "Open day", description: "", tags: ["events"], scope: "company", keep_table_rows: false })).text);
    expect(saved.taken_out).toEqual(["1 client name", "1 date"]);
    expect((await run(marketer(), "list_templates", { kind: "board", search: "open day", tag: "" })).text).toContain('"approved":false');
    const secret = json((await run(designer(), "create_board", { client: "Founder office", project_id: "", title: "Hiring", template_key: "" })).text).board_id as string;
    expect((await run(designer(), "save_as_template", { kind: "board", id: secret, name: "x", description: "", tags: [], scope: "company", keep_table_rows: false })).text).toContain("private space");
    expect((await run(marketer(), "save_as_template", { kind: "board", id: secret, name: "x", description: "", tags: [], scope: "mine", keep_table_rows: false })).ok).toBe(false); // view level
    const page = json((await run(marketer(), "create_page_from_template", { template_key: "builtin:page:meeting_notes", title: "Team sync", client: "" })).text);
    expect(value(await docs.get(marketer(), page.page_id as string)).body).toContain("## Action items");
    expect((await run(marketer(), "create_page_from_template", { template_key: "builtin:board:swot", title: "x", client: "" })).text).toContain("board template");
    expect((await run(marketer(), "use_template", { template_key: saved.template_key, title: "x", client: "Founder office", project_id: "" })).ok).toBe(false);
  });
});

function value<T>(r: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}
