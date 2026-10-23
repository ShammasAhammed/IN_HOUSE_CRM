// Template gallery (Stage 13.6): boards and Docs pages saved as templates, the built-in ones (13.1 and 13.4) next to
// them, and presets. Saving cleans the copy of client data (rules/gallery.ts, D-13.6b) and says what it took out.
//   - Who sees what: company templates are for the whole team (approved ones first); "mine" only for its owner.
//     Built-in templates are always there, approved.
//   - Approved: strategists and the owner set it. A company template from a private space needs manage there.
//   - Using a template makes a new board or page through the boards and docs services, with all their checks.
// Every change is an event.
import { z } from "zod";
import { isId, newId } from "@/lib/id";
import { forbidden, invalid, notFound, ok, type Result } from "@/lib/result";
import { BOARD_TEMPLATE_HINTS, BOARD_TEMPLATE_LABELS, BOARD_TEMPLATES, GALLERY_KINDS, GALLERY_SCOPES, PRESET_KINDS, type BoardTemplate, type GalleryKind, type GalleryScope, type PresetKind, type PresetValue } from "@/lib/types";
import { parse } from "@/lib/validation/common";
import type { DataStore, GalleryTemplateRecord, NewEvent, PresetRecord } from "@/repositories";
import type { BoardsService } from "./boards";
import { change, commit, noChange } from "./change";
import type { Clock } from "./clock";
import type { DocTablesService } from "./doc-tables";
import type { DocService } from "./docs";
import type { Actor } from "./permissions";
import { levelBlocks } from "./spaces";
import { templateScene } from "./rules/board-templates";
import { levelAtLeast } from "./rules/boards";
import { DOC_TEMPLATE_LABELS, DOC_TEMPLATES, templateBody, type DocTemplate } from "./rules/doc-templates";
import { applyPresets, boardPreview, fillClient, pagePreview, removedWords, stripBoard, stripPage, type TemplateTable } from "./rules/gallery";
import { MIND_LAYOUTS } from "./rules/mind-map";

export type GalleryItem = {
  key: string;
  kind: GalleryKind;
  name: string;
  description: string;
  tags: string[];
  scope: GalleryScope;
  approved: boolean;
  builtIn: boolean;
  ownerName: string | null;
  mine: boolean;
  thumbnail: string | null;
  preview: string;
  uses: number;
  createdAt: Date | null;
  canApprove: boolean;
  canRemove: boolean;
};
export type GalleryDetail = GalleryItem & { elements?: unknown[]; body?: string; tables?: TemplateTable[] };

const BUILTIN = "builtin";
const builtinKey = (kind: GalleryKind, t: string) => `${BUILTIN}:${kind}:${t}`;
const MAX_CONTENT_BYTES = 6_000_000;
const COLOUR = z.string().regex(/^#[0-9a-fA-F]{6}$/, { message: "Colours look like #1a2b3c." });

const meta = {
  name: z.string().trim().min(1, { message: "Name the template." }).max(80),
  description: z.string().trim().max(300).default(""),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(8).default([]),
  scope: z.enum(GALLERY_SCOPES).default("mine"),
};
const saveBoardSchema = z.object({ boardId: z.uuid(), ...meta });
const savePageSchema = z.object({ docId: z.uuid(), keepRows: z.boolean().default(false), ...meta });
const useSchema = z.object({
  key: z.string().min(1).max(80),
  title: z.string().trim().min(1, { message: "Give it a name." }).max(120),
  clientId: z.uuid().optional(),
  projectId: z.uuid().optional(),
  palette: z.string().max(60).optional(),
  sticky: z.string().max(60).optional(),
  layout: z.string().max(60).optional(),
});
const presetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("palette"), name: meta.name, scope: meta.scope, value: z.object({ colours: z.array(COLOUR).min(1).max(12) }) }),
  z.object({ kind: z.literal("sticky"), name: meta.name, scope: meta.scope, value: z.object({ colour: COLOUR, font: z.enum(["hand", "clean"]).default("hand") }) }),
  z.object({ kind: z.literal("layout"), name: meta.name, scope: meta.scope, value: z.object({ mindLayout: z.enum(MIND_LAYOUTS).optional(), sectionColours: z.array(COLOUR).max(8).optional() }) }),
]);

/** Strategists and the owner keep the "approved" label and the company presets. */
export const curates = (actor: Actor) => actor.roles.includes("owner") || actor.roles.includes("strategist");

export function createGalleryService(deps: { store: DataStore; clock: Clock; boards: Pick<BoardsService, "open" | "create" | "whereCanCreate">; docs: Pick<DocService, "get" | "create">; docTables: Pick<DocTablesService, "forDoc" | "createFrom"> }) {
  const { store, clock } = deps;

  const event = (actor: Actor, entityType: "gallery_template" | "preset" | "board" | "doc", entityId: string, action: string, data: Record<string, unknown>, clientId: string | null = null): NewEvent => ({ actorId: actor.personId, action, entityType, entityId, clientId, data });

  function item(actor: Actor, t: GalleryTemplateRecord, uses: Map<string, number>): GalleryItem {
    const mine = t.ownerId === actor.personId;
    return { key: t.id, kind: t.kind, name: t.name, description: t.description, tags: t.tags, scope: t.scope, approved: t.approved, builtIn: false, ownerName: t.ownerName, mine, thumbnail: t.thumbnail, preview: t.preview, uses: uses.get(t.id) ?? 0, createdAt: t.createdAt, canApprove: curates(actor) && t.scope === "company", canRemove: mine || (curates(actor) && t.scope === "company") };
  }

  function builtins(uses: Map<string, number>): GalleryItem[] {
    const base = { scope: "company" as const, approved: true, builtIn: true, ownerName: "Oppllo One", mine: false, thumbnail: null, createdAt: null, canApprove: false, canRemove: false };
    return [
      ...BOARD_TEMPLATES.filter((t) => t !== "blank").map((t) => ({ ...base, key: builtinKey("board", t), kind: "board" as const, name: BOARD_TEMPLATE_LABELS[t], description: BOARD_TEMPLATE_HINTS[t], tags: t === "retro" ? ["retro"] : t === "content_month" ? ["content"] : ["planning"], preview: boardPreview(templateScene(t, () => newId()).elements), uses: uses.get(builtinKey("board", t)) ?? 0 })),
      ...DOC_TEMPLATES.filter((t) => t !== "blank").map((t) => ({ ...base, key: builtinKey("page", t), kind: "page" as const, name: DOC_TEMPLATE_LABELS[t], description: "", tags: t === "client_onboarding" ? ["client onboarding"] : t === "meeting_notes" ? ["meetings"] : t === "campaign_brief" ? ["ads", "planning"] : [], preview: pagePreview(templateBody(t)), uses: uses.get(builtinKey("page", t)) ?? 0 })),
    ];
  }

  /** A saved template this person can see, with its content. */
  async function visible(actor: Actor, id: string) {
    const t = isId(id) ? await store.templates.find(id) : null;
    return t && (t.scope === "company" || t.ownerId === actor.personId) ? t : null;
  }

  /** The board or page to save, cleaned. Company templates from a private space need manage there. */
  async function cleanBoard(actor: Actor, boardId: string, scope: GalleryScope) {
    const b = await deps.boards.open(actor, boardId);
    if (!b.ok) return b;
    if (!levelAtLeast(b.value.level, "edit")) return forbidden("You can look at this board but not save it as a template. Ask for edit access.");
    if (scope === "company" && b.value.board.isSpace && b.value.level !== "manage" && (await store.clients.findById(b.value.board.clientId, { kind: "all" }))?.isPrivate) return forbidden("This board is in a private space: only its managers can share it as a company template. Save it as yours.");
    const clientName = b.value.board.isSpace ? null : b.value.board.clientName;
    return ok({ board: b.value.board, ...stripBoard(b.value.scene.elements, clientName, () => newId()) });
  }
  async function cleanPage(actor: Actor, docId: string, keepRows: boolean, scope: GalleryScope) {
    const d = await deps.docs.get(actor, docId);
    if (!d.ok) return d;
    const client = d.value.clientId ? await store.clients.findById(d.value.clientId, { kind: "all" }) : null;
    if (client) {
      if (await levelBlocks(store, actor, client.id, "edit")) return forbidden("You can read this page but not save it as a template. Ask for edit access.");
      if (scope === "company" && client.isPrivate && (await levelBlocks(store, actor, client.id, "manage"))) return forbidden("This page is in a private space: only its managers can share it as a company template. Save it as yours.");
    }
    const tables = await deps.docTables.forDoc(actor, docId);
    const raw: TemplateTable[] = tables.ok ? tables.value.map((t) => ({ id: t.table.id, title: t.table.title, columns: t.table.columns, view: t.table.view, rows: t.rows.map((r) => r.cells) })) : [];
    return ok({ page: d.value, ...stripPage(d.value.body, raw, client && !client.isInternal ? client.name : null, keepRows) });
  }

  async function presetValue(actor: Actor, id: string | undefined, kind: PresetKind, clientId?: string): Promise<PresetValue | undefined> {
    if (!id) return undefined;
    if (id === "brand" && kind === "palette" && clientId) {
      const colours = (await store.knowledge.list([clientId])).knowledge[0]?.brandColours ?? [];
      return colours.length ? { colours } : undefined;
    }
    const p = isId(id) ? await store.templates.preset(id) : null;
    return p && p.kind === kind && (p.scope === "company" || p.ownerId === actor.personId) ? p.value : undefined;
  }

  const service = {
    /** The gallery: approved company and built-in templates first, then the rest; "used" or "new" order within. */
    async list(actor: Actor, filter: { kind?: GalleryKind; q?: string; tag?: string; sort?: "used" | "new" } = {}): Promise<GalleryItem[]> {
      const kind = GALLERY_KINDS.find((k) => k === filter.kind);
      const [rows, uses] = await Promise.all([store.templates.list({ personId: actor.personId, ...(kind ? { kind } : {}) }), store.templates.useCounts()]);
      const all = [...builtins(uses).filter((b) => !kind || b.kind === kind), ...rows.map((r) => item(actor, r, uses))];
      const q = (filter.q ?? "").trim().toLowerCase();
      const tag = (filter.tag ?? "").trim().toLowerCase();
      const hits = all.filter((t) => (!q || `${t.name} ${t.description} ${t.preview} ${t.tags.join(" ")}`.toLowerCase().includes(q)) && (!tag || t.tags.includes(tag)));
      const rank = (t: GalleryItem) => (t.approved ? 0 : t.mine ? 1 : 2);
      return hits.sort((a, b) => rank(a) - rank(b) || (filter.sort === "new" ? (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0) : b.uses - a.uses) || a.name.localeCompare(b.name));
    },

    /** Every tag in use, for the filter. */
    async tags(actor: Actor): Promise<string[]> {
      return [...new Set((await service.list(actor)).flatMap((t) => t.tags))].sort();
    },

    /** One template with its content, for the preview. */
    async get(actor: Actor, key: string): Promise<Result<GalleryDetail>> {
      const uses = await store.templates.useCounts();
      if (key.startsWith(`${BUILTIN}:`)) {
        // "Blank" isn't listed in the gallery, but a new board can start from it with presets.
        const blank = { ...builtins(uses)[0]!, key: builtinKey("board", "blank"), name: BOARD_TEMPLATE_LABELS.blank, description: BOARD_TEMPLATE_HINTS.blank, tags: [], preview: "" };
        const b = [...builtins(uses), blank].find((x) => x.key === key);
        if (!b) return notFound("That template");
        const name = key.split(":")[2]!;
        return ok(b.kind === "board" ? { ...b, elements: templateScene(name as BoardTemplate, () => newId()).elements } : { ...b, body: templateBody(name as DocTemplate), tables: [] });
      }
      const t = await visible(actor, key);
      if (!t) return notFound("That template");
      const c = t.content as { elements?: unknown[]; body?: string; tables?: TemplateTable[] };
      return ok({ ...item(actor, t, uses), ...(t.kind === "board" ? { elements: c.elements ?? [] } : { body: c.body ?? "", tables: c.tables ?? [] }) });
    },

    /** What saving would take out, before saving (the warning). */
    async check(actor: Actor, raw: unknown): Promise<Result<{ removed: string[] }>> {
      const p = parse(z.object({ boardId: z.uuid().optional(), docId: z.uuid().optional(), keepRows: z.boolean().default(false) }), raw);
      if (!p.ok) return p;
      if (p.value.boardId) {
        const c = await cleanBoard(actor, p.value.boardId, "mine");
        return c.ok ? ok({ removed: removedWords(c.value.removed) }) : c;
      }
      if (!p.value.docId) return invalid("Pick a board or a page.");
      const c = await cleanPage(actor, p.value.docId, p.value.keepRows, "mine");
      return c.ok ? ok({ removed: removedWords(c.value.removed) }) : c;
    },

    async saveBoard(actor: Actor, raw: unknown): Promise<Result<{ id: string; removed: string[]; elements: unknown[] }>> {
      const p = parse(saveBoardSchema, raw);
      if (!p.ok) return p;
      const v = p.value;
      const c = await cleanBoard(actor, v.boardId, v.scope);
      if (!c.ok) return c;
      const content = { elements: c.value.elements, appState: {} };
      if (JSON.stringify(content).length > MAX_CONTENT_BYTES) return invalid("This board is too big for a template. Save part of it (select, then “Move to a new board”).");
      const id = newId();
      return commit(store, async (repos) => {
        await repos.templates.create({ id, kind: "board", name: v.name, description: v.description, tags: v.tags, scope: v.scope, ownerId: actor.personId, thumbnail: null, preview: boardPreview(c.value.elements), content, at: clock.now() });
        return change({ id, removed: removedWords(c.value.removed), elements: c.value.elements }, event(actor, "gallery_template", id, "gallery_template.saved", { kind: "board", name: v.name, scope: v.scope, fromBoard: v.boardId, removed: c.value.removed }));
      });
    },

    async savePage(actor: Actor, raw: unknown): Promise<Result<{ id: string; removed: string[] }>> {
      const p = parse(savePageSchema, raw);
      if (!p.ok) return p;
      const v = p.value;
      const c = await cleanPage(actor, v.docId, v.keepRows, v.scope);
      if (!c.ok) return c;
      const content = { body: c.value.body, tables: c.value.tables };
      if (JSON.stringify(content).length > MAX_CONTENT_BYTES) return invalid("This page is too big for a template.");
      const id = newId();
      return commit(store, async (repos) => {
        await repos.templates.create({ id, kind: "page", name: v.name, description: v.description, tags: v.tags, scope: v.scope, ownerId: actor.personId, thumbnail: null, preview: pagePreview(c.value.body), content, at: clock.now() });
        return change({ id, removed: removedWords(c.value.removed) }, event(actor, "gallery_template", id, "gallery_template.saved", { kind: "page", name: v.name, scope: v.scope, fromPage: v.docId, removed: c.value.removed }));
      });
    },

    /** The picture of a saved board template, made in the browser from the cleaned scene. */
    async setThumbnail(actor: Actor, id: string, thumbnail: string): Promise<Result<null>> {
      const t = await visible(actor, id);
      if (!t || t.ownerId !== actor.personId) return notFound("That template");
      if (!thumbnail.startsWith("data:image/png;base64,") || thumbnail.length > 200_000) return invalid("That picture can't be used.");
      await store.templates.update(t.id, { thumbnail, at: clock.now() });
      return ok(null);
    },

    async approve(actor: Actor, id: string, on: boolean): Promise<Result<null>> {
      if (!curates(actor)) return forbidden("Strategists and the owner approve company templates.");
      const t = await visible(actor, id);
      if (!t || t.scope !== "company") return notFound("That company template");
      if (t.approved === on) return ok(null);
      return commit(store, async (repos) => {
        await repos.templates.update(t.id, { approved: on, approvedById: on ? actor.personId : null, at: clock.now() });
        return change(null, event(actor, "gallery_template", t.id, on ? "gallery_template.approved" : "gallery_template.unapproved", { name: t.name }));
      });
    },

    async edit(actor: Actor, id: string, raw: unknown): Promise<Result<null>> {
      const p = parse(z.object(meta), raw);
      if (!p.ok) return p;
      const t = await visible(actor, id);
      if (!t) return notFound("That template");
      if (t.ownerId !== actor.personId && !(curates(actor) && t.scope === "company")) return forbidden("Only who saved it, a strategist or the owner can change it.");
      return commit(store, async (repos) => {
        // Moving to company, or changing it, asks for approval again.
        await repos.templates.update(t.id, { ...p.value, ...(p.value.scope !== t.scope ? { approved: false, approvedById: null } : {}), at: clock.now() });
        return change(null, event(actor, "gallery_template", t.id, "gallery_template.changed", { name: p.value.name, scope: p.value.scope }));
      });
    },

    async remove(actor: Actor, id: string): Promise<Result<null>> {
      const t = await visible(actor, id);
      if (!t) return notFound("That template");
      if (t.ownerId !== actor.personId && !(curates(actor) && t.scope === "company")) return forbidden("Only who saved it, a strategist or the owner can remove it.");
      return commit(store, async (repos) => {
        await repos.templates.remove(t.id, clock.now());
        return change(null, event(actor, "gallery_template", t.id, "gallery_template.removed", { name: t.name }));
      });
    },

    /** A new board or page from a template, in a client, space or project (or a team page): names filled in. */
    async use(actor: Actor, raw: unknown): Promise<Result<{ kind: GalleryKind; id: string }>> {
      const p = parse(useSchema, raw);
      if (!p.ok) return p;
      const v = p.value;
      const t = await service.get(actor, v.key);
      if (!t.ok) return t;
      const client = v.clientId ? await store.clients.findById(v.clientId, { kind: "all" }) : null;
      const name = client && !client.isInternal ? client.name : null;
      const fill = (s: string) => (name ? fillClient(s, name) : s);
      let made: { kind: GalleryKind; id: string; clientId: string | null };
      if (t.value.kind === "board") {
        if (!v.clientId) return invalid("Pick a client, space or project for the board.", { clientId: ["Pick one."] });
        const [palette, sticky, layout] = await Promise.all([presetValue(actor, v.palette, "palette", v.clientId), presetValue(actor, v.sticky, "sticky"), presetValue(actor, v.layout, "layout")]);
        const elements = applyPresets(
          (t.value.elements as Array<Record<string, unknown> & { id: string; type: string }>).map((e) => (e.type === "text" ? { ...e, text: fill(String(e.text ?? "")), originalText: fill(String(e.originalText ?? e.text ?? "")) } : e.type === "frame" && typeof e.name === "string" ? { ...e, name: fill(e.name) } : e)),
          { ...(palette ? { palette } : {}), ...(sticky ? { sticky } : {}), ...(layout ? { layout } : {}) },
        );
        const r = await deps.boards.create(actor, { clientId: v.clientId, ...(v.projectId ? { projectId: v.projectId } : {}), title: v.title, elements });
        if (!r.ok) return r;
        made = { kind: "board", id: r.value.id, clientId: v.clientId };
      } else {
        const ids = new Map((t.value.tables ?? []).map((tb) => [tb.id, newId()]));
        const body = fill(t.value.body ?? "").replace(/^::table\[([^\]\n]+)\]/gm, (m, old: string) => (ids.has(old) ? `::table[${ids.get(old)}]` : m));
        const r = await deps.docs.create(actor, { title: v.title, body, ...(v.clientId ? { clientId: v.clientId } : {}) });
        if (!r.ok) return r;
        for (const tb of t.value.tables ?? []) {
          const made = await deps.docTables.createFrom(actor, { id: ids.get(tb.id)!, docId: r.value.id, title: tb.title, columns: tb.columns, view: tb.view, rows: tb.rows.map((row) => Object.fromEntries(Object.entries(row).map(([k, x]) => [k, typeof x === "string" ? fill(x) : x]))) });
          if (!made.ok) return made;
        }
        made = { kind: "page", id: r.value.id, clientId: v.clientId ?? null };
      }
      return commit(store, async (repos) => {
        await repos.templates.addUse({ id: newId(), templateKey: v.key, personId: actor.personId, at: clock.now() });
        return change({ kind: made.kind, id: made.id }, event(actor, made.kind === "board" ? "board" : "doc", made.id, "gallery_template.used", { template: v.key, name: t.value.name }, made.clientId));
      });
    },

    // ---------- presets ----------

    /** Presets this person can pick (company and their own), plus the client's brand colours as a palette. */
    async presets(actor: Actor, clientId?: string): Promise<{ presets: PresetRecord[]; brand: string[]; canShare: boolean }> {
      const [presets, kb] = await Promise.all([store.templates.presets(actor.personId), clientId && isId(clientId) ? store.knowledge.list([clientId]) : Promise.resolve(null)]);
      return { presets, brand: kb?.knowledge[0]?.brandColours ?? [], canShare: curates(actor) };
    },

    async savePreset(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      const p = parse(presetSchema, raw);
      if (!p.ok) return p;
      const v = p.value;
      if (v.scope === "company" && !curates(actor)) return forbidden("Strategists and the owner add company presets. Save it as yours.");
      const id = newId();
      return commit(store, async (repos) => {
        await repos.templates.addPreset({ id, kind: v.kind, name: v.name, value: v.value as PresetValue, scope: v.scope, ownerId: actor.personId, at: clock.now() });
        return change({ id }, event(actor, "preset", id, "preset.saved", { kind: v.kind, name: v.name, scope: v.scope }));
      });
    },

    async removePreset(actor: Actor, id: string): Promise<Result<null>> {
      const pr = isId(id) ? await store.templates.preset(id) : null;
      if (!pr || (pr.scope !== "company" && pr.ownerId !== actor.personId)) return notFound("That preset");
      if (pr.ownerId !== actor.personId && !curates(actor)) return forbidden("Only who saved it, a strategist or the owner can remove it.");
      return commit(store, async (repos) => {
        await repos.templates.removePreset(pr.id, clock.now());
        return pr ? change(null, event(actor, "preset", pr.id, "preset.removed", { name: pr.name })) : noChange(null);
      });
    },

    kinds: PRESET_KINDS,
  };
  return service;
}

export type GalleryService = ReturnType<typeof createGalleryService>;
