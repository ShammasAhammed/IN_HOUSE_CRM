// Boards and templates through the Oppllo MCP (Stage 13.6): anyone can build boards from their own Claude or ChatGPT,
// on their own plan, with exactly their own rights (14.2 levels: view can't change anything; private spaces stay
// private). Every change goes through the boards or gallery service, so it is checked and written as an event;
// nothing leaves Oppllo One. Inputs are checked and capped (300 stickies or mind-map ideas per call).
import { z } from "zod";
import type { AiTool } from "@/repositories";
import { formatDateTime } from "@/lib/format";
import { newId } from "@/lib/id";
import { GALLERY_SCOPES } from "@/lib/types";
import type { BoardsService } from "./boards";
import { fromResult, tool } from "./assistant";
import type { GalleryService } from "./gallery";
import type { Actor } from "./permissions";
import { addMindMap, addSection, addStickies, describeBoard, MAX_NODES } from "./rules/board-build";
import { STICKY_COLOURS } from "./rules/board-templates";
import { MIND_LAYOUTS, parseList, type ListItem } from "./rules/mind-map";

export type BoardToolDeps = { boards: BoardsService; gallery: GalleryService };

const text = (d: string) => z.string().describe(d);
const COLOURS = ["", ...Object.keys(STICKY_COLOURS)] as [string, ...string[]];
type Tree = { text: string; children?: Tree[] };
const treeSchema: z.ZodType<Tree> = z.lazy(() => z.object({ text: z.string().max(300), children: z.array(treeSchema).max(MAX_NODES).optional() }));
const toItems = (t: Tree): ListItem => ({ text: t.text.trim(), children: (t.children ?? []).map(toItems) });

export function boardTools(actor: Actor, d: BoardToolDeps): AiTool[] {
  /** A client or space by name: one this person can see (reading) or start boards in (writing). */
  async function place(name: string, write: boolean): Promise<{ ok: true; id: string; name: string } | { ok: false; text: string }> {
    const q = name.trim().toLowerCase();
    if (!q) return { ok: false, text: "Name the client or space." };
    let list: Array<{ id: string; name: string }>;
    if (write) list = await d.boards.whereCanCreate(actor);
    else {
      const lib = await d.boards.library(actor);
      list = lib.ok ? [...new Map(lib.value.boards.map((b) => [b.clientId, { id: b.clientId, name: b.clientName }])).values()] : [];
    }
    const exact = list.filter((p) => p.name.toLowerCase() === q);
    const hits = exact.length ? exact : list.filter((p) => p.name.toLowerCase().includes(q));
    if (hits.length === 1) return { ok: true, id: hits[0]!.id, name: hits[0]!.name };
    if (!hits.length) return { ok: false, text: write ? `"${name}" isn't a client or space where you can make boards (you need edit access there).` : `No boards you can see belong to "${name}".` };
    return { ok: false, text: `"${name}" matches ${hits.map((p) => p.name).join(", ")}. Which one?` };
  }
  const edited = (r: Awaited<ReturnType<BoardsService["edit"]>>, what: string) => (r.ok ? { ok: true, text: `${what} Board is now at version ${r.value.version}.` } : { ok: false, text: r.error.message });

  return [
    tool({
      name: "list_boards",
      description: "Idea boards (brainstorming canvases) the person can open, newest change first: id, title, client or space, project, section, tags and their access level (view, comment, edit, manage). Filter by client or space name and by words on the board.",
      input: z.strictObject({ client: text('Client or space name, or "" for all.'), search: text('Words in the title or on the board, or "".') }),
      run: async ({ client, search }) => {
        let clientId: string | undefined;
        if (client.trim()) {
          const p = await place(client, false);
          if (!p.ok) return p;
          clientId = p.id;
        }
        return fromResult(await d.boards.library(actor, { ...(clientId ? { clientId } : {}), ...(search.trim() ? { q: search.trim() } : {}), limit: 50 }), (v) =>
          v.boards.map((b) => ({ id: b.id, title: b.title, client: b.clientName, project: b.projectName, section: b.section, tags: b.tags, level: b.level, updated: formatDateTime(new Date(b.updatedAt)) })),
        );
      },
    }),
    tool({
      name: "read_board",
      description: "One board as structured text: its frames and sections with the stickies in each (stamps like [approved] after the text), its mind maps as indented lists, and anything else on it. Use the frame and section names with add_stickies.",
      input: z.strictObject({ board_id: text("The board's id from list_boards.") }),
      run: async ({ board_id }) => fromResult(await d.boards.open(actor, board_id), (p) => ({ title: p.board.title, client: p.board.clientName, project: p.board.projectName, level: p.level, version: p.board.version, ...describeBoard(p.scene.elements) })),
    }),
    tool({
      name: "create_board",
      description: "Make a new board in a client or space (optionally a project of it), blank or from a template (keys from list_templates, kind board). Confirm the client and title with the person first. Returns the new board's id for add_stickies, create_mind_map and add_section.",
      input: z.strictObject({ client: text("Client or space name."), project_id: text('A project id of that client, or "".'), title: text("The board's name, e.g. \"MES College November campaign\"."), template_key: text('A board template key from list_templates, or "" for blank.') }),
      run: async ({ client, project_id, title, template_key }) => {
        const p = await place(client, true);
        if (!p.ok) return p;
        const where = { clientId: p.id, ...(project_id ? { projectId: project_id } : {}), title };
        const r = template_key ? await d.gallery.use(actor, { key: template_key, ...where }) : await d.boards.create(actor, where);
        return fromResult(r, (v) => ({ board_id: v.id, client: p.name, done: "Board made." }));
      },
    }),
    tool({
      name: "add_stickies",
      description: `Add sticky notes to a board (up to ${MAX_NODES} at a time), into a frame or section by its name (read_board lists them; it grows to fit) or, with "", in a new block to the right of what's there. Needs edit access.`,
      input: z.strictObject({ board_id: text("The board's id."), stickies: z.array(z.string().max(300)).min(1).max(MAX_NODES).describe("The text of each sticky, short."), colour: z.enum(COLOURS).describe('Sticky colour, or "" for yellow.'), into: text('Frame or section name, or "".') }),
      run: async ({ board_id, stickies, colour, into }) => {
        const texts = stickies.map((s) => s.trim()).filter(Boolean);
        return edited(await d.boards.edit(actor, board_id, "board.stickies_added", (els) => {
          const r = addStickies(els, texts, { colour: colour || undefined, into: into || undefined }, () => newId());
          return typeof r === "string" ? r : { elements: r.elements, data: { stickies: r.placed, into: into || null, via: "mcp" } };
        }), `Added ${texts.length} stick${texts.length === 1 ? "y" : "ies"}${into ? ` to "${into}"` : ""}.`);
      },
    }),
    tool({
      name: "create_mind_map",
      description: `Draw a mind map on a board, to the right of what's there (up to ${MAX_NODES} ideas). Give either an indented outline ("- Campaign\\n  - Audience\\n    - Parents") or a tree as JSON ({"text":"Campaign","children":[{"text":"Audience"}]}). Several top-level items hang from a root named by title. Layout: right, left, both, down or radial. Needs edit access.`,
      input: z.strictObject({ board_id: text("The board's id."), outline: text('An indented list, or "" when tree_json is given.'), tree_json: text('A JSON tree {"text","children":[...]}, or "".'), title: text('The root idea when the outline has several top items, or "".'), layout: z.enum(MIND_LAYOUTS) }),
      run: async ({ board_id, outline, tree_json, title, layout }) => {
        let items: ListItem[];
        if (tree_json.trim()) {
          let raw: unknown;
          try {
            raw = JSON.parse(tree_json);
          } catch {
            return { ok: false, text: "tree_json isn't valid JSON." };
          }
          const parsed = treeSchema.safeParse(raw);
          if (!parsed.success) return { ok: false, text: 'tree_json must look like {"text":"…","children":[…]}.' };
          items = [toItems(parsed.data)];
        } else items = parseList(outline.slice(0, 30_000));
        let nodes = 0;
        const r = await d.boards.edit(actor, board_id, "board.mind_map_added", (els) => {
          const m = addMindMap(els, items, { title: title || "Ideas", layout }, () => newId());
          if (typeof m === "string") return m;
          nodes = m.nodes;
          return { elements: m.elements, data: { nodes: m.nodes, layout, via: "mcp" } };
        });
        return edited(r, `Mind map with ${nodes} ideas added (${layout}).`);
      },
    }),
    tool({
      name: "add_section",
      description: "Add a section (a named, coloured area that groups things) to the right of a board's content, optionally with stickies inside. Colour as #hex or \"\" for the next default. Needs edit access.",
      input: z.strictObject({ board_id: text("The board's id."), name: text("The section's name, e.g. \"Week 1\"."), colour: text('#hex, or "".'), stickies: z.array(z.string().max(300)).max(MAX_NODES).describe("Stickies to put inside (can be empty).") }),
      run: async ({ board_id, name, colour, stickies }) =>
        edited(await d.boards.edit(actor, board_id, "board.section_added", (els) => {
          const r = addSection(els, name, { colour: colour || undefined, stickies: stickies.map((s) => s.trim()).filter(Boolean) }, () => newId());
          return typeof r === "string" ? r : { elements: r.elements, data: { section: name, stickies: stickies.length, via: "mcp" } };
        }), `Section "${name}" added.`),
    }),
    tool({
      name: "list_templates",
      description: "Board and page templates in the team's gallery (approved and built-in first; the person's own too), with keys for use_template, create_board and create_page_from_template.",
      input: z.strictObject({ kind: z.enum(["", "board", "page"]).describe('"" for both.'), search: text('Words, or "".'), tag: text('A tag like sales, content, hr, or "".') }),
      run: async ({ kind, search, tag }) => {
        const list = await d.gallery.list(actor, { ...(kind ? { kind } : {}), q: search, tag });
        return { ok: true, text: list.length ? JSON.stringify(list.slice(0, 60).map((t) => ({ key: t.key, kind: t.kind, name: t.name, description: t.description, tags: t.tags, approved: t.approved, mine: t.mine, uses: t.uses, preview: t.preview.slice(0, 160) }))) : "No template matches." };
      },
    }),
    tool({
      name: "use_template",
      description: 'Make a new board or Docs page from a template (key from list_templates). Boards need a client or space; a page without one is a team page. "{client}" in the template becomes the client\'s name. Confirm with the person first.',
      input: z.strictObject({ template_key: text("Key from list_templates."), title: text("Name of the new board or page."), client: text('Client or space name ("" only for a team page).'), project_id: text('A project id for a board, or "".') }),
      run: async ({ template_key, title, client, project_id }) => {
        let clientId: string | undefined;
        if (client.trim()) {
          const p = await place(client, true);
          if (!p.ok) return p;
          clientId = p.id;
        }
        return fromResult(await d.gallery.use(actor, { key: template_key, title, ...(clientId ? { clientId } : {}), ...(project_id ? { projectId: project_id } : {}) }), (v) => ({ kind: v.kind, id: v.id, done: v.kind === "board" ? "Board made." : "Page made." }));
      },
    }),
    tool({
      name: "create_page_from_template",
      description: "Make a new Docs page from a page template (key from list_templates, kind page), for a client or space or as a team page.",
      input: z.strictObject({ template_key: text("A page template key."), title: text("The page's title."), client: text('Client or space name, or "" for a team page.') }),
      run: async ({ template_key, title, client }) => {
        const t = await d.gallery.get(actor, template_key);
        if (!t.ok) return { ok: false, text: t.error.message };
        if (t.value.kind !== "page") return { ok: false, text: "That's a board template: use create_board or use_template." };
        let clientId: string | undefined;
        if (client.trim()) {
          const p = await place(client, true);
          if (!p.ok) return p;
          clientId = p.id;
        }
        return fromResult(await d.gallery.use(actor, { key: template_key, title, ...(clientId ? { clientId } : {}) }), (v) => ({ page_id: v.id, done: "Page made." }));
      },
    }),
    tool({
      name: "save_as_template",
      description: "Save a board or a Docs page as a template in the gallery. Client data is taken out of the copy (live cards, pictures and links become placeholders, the client's name becomes {client}, dates and contacts are removed, person mentions become names); the reply says what was taken out. scope \"mine\" is only for the person; \"company\" waits for a strategist or the owner to approve it.",
      input: z.strictObject({ kind: z.enum(["board", "page"]), id: text("The board's or page's id."), name: text("Template name."), description: text('What it is for, or "".'), tags: z.array(z.string().max(30)).max(8).describe("Tags like sales, content, hr."), scope: z.enum(GALLERY_SCOPES), keep_table_rows: z.boolean().describe("Pages only: keep the rows of tables (people left out).") }),
      run: async ({ kind, id, name, description, tags, scope, keep_table_rows }) => {
        const meta = { name, description, tags, scope };
        const r = kind === "board" ? await d.gallery.saveBoard(actor, { boardId: id, ...meta }) : await d.gallery.savePage(actor, { docId: id, keepRows: keep_table_rows, ...meta });
        return fromResult(r, (v) => ({ template_key: v.id, taken_out: v.removed, done: scope === "company" ? "Saved; waiting for approval." : "Saved for you." }));
      },
    }),
  ];
}
