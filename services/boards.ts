// Idea Boards (Stage 13.1): a canvas per client, project or space, drawn with Excalidraw in the browser and kept here as
// Excalidraw's scene JSON plus our own data (D-13.1a).
//   - Who: anyone who sees the client or space (and the project, when the board is on one) opens its boards. Levels
//     (14.2 words): view = look and vote; comment = also react and comment; edit = draw, run votes and the timer;
//     manage = archive and restore. Space members get their space level; others get it from their role (rules/boards).
//   - Saving: every save names the version it started from; when someone else saved first it is refused with "someone
//     else changed this board — reload", never silently overwritten. An automatic version is kept every 15 minutes
//     of saving; named snapshots on request; restoring keeps the current state as a version first.
//   - Votes are hidden until the facilitator reveals them; each person has a set number per round.
//   - Boards are staff-only: never in the client portal (13.5 decides client sharing).
// Every change is an event.
import { z } from "zod";
import { isId, newId } from "@/lib/id";
import { conflict, forbidden, invalid, notFound, ok, type Result } from "@/lib/result";
import { BOARD_REACTIONS, BOARD_TEMPLATES, type AccessLevel, type BoardCardKind, type BoardTemplate } from "@/lib/types";
import { parse } from "@/lib/validation/common";
import type { BoardRecord, BoardScene, BoardSummary, BoardVersionRow, ClientRecord, DataStore, FileStorage, NewEvent, Repositories } from "@/repositories";
import { change, commit } from "./change";
import type { Clock } from "./clock";
import { toActor } from "./identity";
import { can, clientScope, seesAllSpaces, type Actor } from "./permissions";
import { projectScope } from "./projects";
import { cardElement, templateScene } from "./rules/board-templates";
import { cardUrl } from "./rules/references";
import {
  AUTO_VERSION_MINUTES,
  boardItems,
  boardLevel,
  boardSearchText,
  IMAGE_TYPES,
  levelAtLeast,
  MAX_IMAGE_BYTES,
  MAX_SCENE_BYTES,
  MAX_THUMBNAIL_CHARS,
  objectCount,
  tally,
  targetIds,
  WARN_BYTES,
  WARN_OBJECTS,
  type BoardItem,
} from "./rules/boards";
import { findMentions } from "./rules/mentions";

export type BoardCard = BoardSummary & { level: AccessLevel };
export type BoardState = {
  version: number;
  updatedAt: Date;
  updatedByName: string | null;
  archived: boolean;
  voting: null | { round: number; perPerson: number; open: boolean; revealed: boolean; myVotes: string[]; left: number; voters: number; results: Array<{ elementId: string; text: string; votes: number }> | null };
  timer: BoardRecord["timer"];
  reactions: Array<{ elementId: string; emoji: string; count: number; mine: boolean }>;
  comments: Array<{ id: string; elementId: string | null; authorName: string; body: string; createdAt: Date; mine: boolean; canRemove: boolean }>;
};
export type BoardPage = {
  board: BoardRecord & { clientName: string; isSpace: boolean; projectName: string | null; createdByName: string | null };
  scene: BoardScene;
  level: AccessLevel;
  items: BoardItem[];
  frames: Array<{ id: string; name: string }>;
  state: BoardState;
  versions: BoardVersionRow[];
  /** People who can see this board: @mentions. */
  people: Array<{ id: string; name: string }>;
  brandColours: string[];
  fileKeys: string[];
  /** Stickies turned into tasks (Stage 13.2). */
  taskLinks: Array<{ elementId: string; taskId: string }>;
  favourite: boolean;
  /** A very big board: suggest splitting it. */
  tooBig: boolean;
};

/** A save that removes over half of a board this size keeps the state before it as a version. */
const BIG_DROP_MIN = 10;
const APP_STATE_KEYS = ["viewBackgroundColor", "gridSize", "gridStep", "gridModeEnabled", "objectsSnapModeEnabled"] as const;
const element = z.looseObject({ id: z.string().min(1).max(100), type: z.string().min(1).max(40) });
const sceneFields = { elements: z.array(element).max(50_000), appState: z.record(z.string(), z.unknown()).optional() };
const title = z.string().trim().min(1, { message: "Give the board a name." }).max(120, { message: "Keep the name under 120 characters." });
const section = z.string().trim().max(60).optional();
const tags = z.array(z.string().trim().min(1).max(30)).max(12).optional();
const createSchema = z.object({ clientId: z.uuid(), projectId: z.uuid().optional(), title, section, tags, template: z.enum(BOARD_TEMPLATES).optional().default("blank"), elements: sceneFields.elements.optional() });
const saveSchema = z.object({ boardId: z.uuid(), baseVersion: z.number().int().min(1), ...sceneFields, thumbnail: z.string().max(MAX_THUMBNAIL_CHARS).startsWith("data:image/").nullable().optional() });
const settingsSchema = z.object({ boardId: z.uuid(), title: title.optional(), section: section.nullable(), tags, projectId: z.uuid().nullable().optional() });
const stickyTaskSchema = z.object({
  boardId: z.uuid(),
  elementId: z.string().min(1).max(100),
  projectId: z.uuid({ message: "Pick a project." }),
  ownerId: z.uuid().optional(),
  dueDate: z.iso.date().optional(),
  title: z.string().trim().max(200).optional(),
});
const commentSchema = z.object({ boardId: z.uuid(), elementId: z.string().min(1).max(100).nullable().optional(), body: z.string().trim().min(1, { message: "Write something first." }).max(2000) });

/** Only the settings worth keeping; Excalidraw's appState carries much more (selection, zoom, open menus). */
function cleanScene(elements: unknown[], appState?: Record<string, unknown>): BoardScene {
  const keep: Record<string, unknown> = {};
  for (const k of APP_STATE_KEYS) if (appState && k in appState) keep[k] = appState[k];
  return { elements, appState: keep };
}
const bytesOf = (scene: BoardScene) => new TextEncoder().encode(JSON.stringify(scene)).length;

/** This person's level on boards of this client or space, or null when they can't see it. */
export async function clientLevel(repos: Pick<Repositories, "clients">, actor: Actor, clientId: string, creatorId: string | null = null): Promise<{ client: ClientRecord; level: AccessLevel } | null> {
  const client = isId(clientId) ? await repos.clients.findById(clientId, clientScope(actor)) : null;
  if (!client) return null;
  const me = (await repos.clients.listMembers(client.id)).find((m) => m.personId === actor.personId);
  const roleEdit = can(actor, "projects.write") || can(actor, "assets.write") || (!client.isInternal && Boolean(me));
  const level = boardLevel({
    owner: seesAllSpaces(actor),
    // Space levels limit whatever the role allows (14.2); a client team is not a level.
    member: client.isInternal ? (me?.level ?? null) : null,
    roleEdit,
    roleManage: can(actor, "clients.write") && can(actor, "projects.write"),
    creator: creatorId === actor.personId,
  });
  return { client, level };
}

/** Stage 13.2: tasks are made by the task service, with all its checks (14.1/14.2). */
type TaskMaker = { create(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> };
/** Stage 13.1b: board → Docs page, made by the docs service with its own checks. */
type DocMaker = { create(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> };

export function createBoardsService(deps: { store: DataStore; clock: Clock; storage: FileStorage; tasks?: TaskMaker; docs?: DocMaker }) {
  const { store, clock, storage } = deps;

  /** The board and this person's level on it, when they can see it (its client, and its project when it has one). */
  async function access(actor: Actor, boardId: string): Promise<{ board: BoardRecord; client: ClientRecord; level: AccessLevel } | null> {
    const board = isId(boardId) ? await store.boards.find(boardId) : null;
    if (!board) return null;
    const c = await clientLevel(store, actor, board.clientId, board.createdById);
    if (!c) return null;
    if (board.projectId && !(await store.projects.findById(board.projectId, projectScope(actor), clock.today()))) return null;
    return { board, ...c };
  }

  const LEVEL_WORDS: Record<AccessLevel, string> = { view: "look and vote", comment: "react and comment", edit: "draw on this board", manage: "archive or restore boards" };
  async function need(actor: Actor, boardId: string, level: AccessLevel, opts: { live?: boolean } = { live: true }) {
    const a = await access(actor, boardId);
    if (!a) return notFound("That board");
    if (!levelAtLeast(a.level, level)) return forbidden(`You can ${LEVEL_WORDS[a.level]} here, but not ${LEVEL_WORDS[level]}. Ask the board's owner or the space's manager.`);
    if (opts.live && a.board.archivedAt) return invalid("This board is archived. Restore it first.");
    return ok(a);
  }

  const event = (actor: Actor, b: Pick<BoardRecord, "id" | "clientId" | "title">, action: string, data: Record<string, unknown> = {}): NewEvent => ({ actorId: actor.personId, action, entityType: "board", entityId: b.id, clientId: b.clientId, data: { title: b.title, ...data } });

  /** Who can see a board: candidates for @mentions. */
  async function viewers(board: BoardRecord): Promise<Array<{ id: string; fullName: string }>> {
    const out: Array<{ id: string; fullName: string }> = [];
    for (const p of await store.people.listActive()) {
      const a = toActor(p);
      if (!(await clientLevel(store, a, board.clientId))) continue;
      if (board.projectId && !(await store.projects.findById(board.projectId, projectScope(a), clock.today()))) continue;
      out.push({ id: p.id, fullName: p.fullName });
    }
    return out;
  }

  async function state(actor: Actor, board: BoardRecord, items: BoardItem[], level: AccessLevel): Promise<BoardState> {
    const [reactions, comments, votes, updater] = await Promise.all([
      store.boards.reactions(board.id),
      store.boards.comments(board.id),
      board.voting ? store.boards.votes(board.id, board.voting.round) : Promise.resolve([]),
      board.updatedById ? store.people.findById(board.updatedById) : Promise.resolve(null),
    ]);
    const r = new Map<string, { elementId: string; emoji: string; count: number; mine: boolean }>();
    for (const x of reactions) {
      const k = `${x.elementId} ${x.emoji}`;
      const cur = r.get(k) ?? { elementId: x.elementId, emoji: x.emoji, count: 0, mine: false };
      cur.count++;
      cur.mine ||= x.personId === actor.personId;
      r.set(k, cur);
    }
    const v = board.voting;
    const mine = votes.filter((x) => x.personId === actor.personId).map((x) => x.elementId);
    return {
      version: board.version,
      updatedAt: board.updatedAt,
      updatedByName: updater?.fullName ?? null,
      archived: Boolean(board.archivedAt),
      voting: v
        ? {
            ...v,
            myVotes: mine,
            left: Math.max(0, v.perPerson - mine.length),
            voters: new Set(votes.map((x) => x.personId)).size,
            // Hidden until revealed: before that, nobody sees anyone else's votes.
            results: v.revealed ? tally(votes, items).map((t) => ({ elementId: t.item.id, text: t.item.text, votes: t.votes })) : null,
          }
        : null,
      timer: board.timer,
      reactions: [...r.values()],
      comments: comments.map((c) => ({ id: c.id, elementId: c.elementId, authorName: c.authorName, body: c.body, createdAt: c.createdAt, mine: c.authorId === actor.personId, canRemove: c.authorId === actor.personId || level === "manage" })),
    };
  }

  /** Boards this person may open, newest change first. */
  async function library(actor: Actor, filter: { clientId?: string; projectId?: string; q?: string; archived?: boolean; limit?: number } = {}): Promise<Result<{ boards: BoardCard[]; sections: string[]; tags: string[]; canCreate: boolean }>> {
    let clientIds: string[];
    let canCreate = false;
    if (filter.clientId) {
      const c = await clientLevel(store, actor, filter.clientId);
      if (!c) return notFound("That client");
      clientIds = [c.client.id];
      canCreate = levelAtLeast(c.level, "edit");
    } else {
      clientIds = await store.clients.visibleIds(clientScope(actor));
    }
    const rows = await store.boards.list({ clientIds, ...(filter.projectId ? { projectId: filter.projectId } : {}), archived: filter.archived ?? false, ...(filter.q ? { q: filter.q } : {}), personId: actor.personId, ...(filter.limit ? { limit: filter.limit } : {}) });
    const projectOk = new Map<string, boolean>();
    const levels = new Map<string, AccessLevel | null>();
    const boards: BoardCard[] = [];
    for (const b of rows) {
      if (b.projectId) {
        if (!projectOk.has(b.projectId)) projectOk.set(b.projectId, Boolean(await store.projects.findById(b.projectId, projectScope(actor), clock.today())));
        if (!projectOk.get(b.projectId)) continue;
      }
      const key = `${b.clientId} ${b.createdById === actor.personId}`;
      if (!levels.has(key)) levels.set(key, (await clientLevel(store, actor, b.clientId, b.createdById))?.level ?? null);
      const level = levels.get(key);
      if (level) boards.push({ ...b, level });
    }
    return ok({ boards, sections: [...new Set(boards.map((b) => b.section).filter((s): s is string => Boolean(s)))].sort(), tags: [...new Set(boards.flatMap((b) => b.tags))].sort(), canCreate });
  }

  return {
    library,

    /** Up to six recent boards for a client, space or project page. */
    async card(actor: Actor, where: { clientId: string; projectId?: string }): Promise<Result<{ boards: BoardCard[]; canCreate: boolean; total: number }>> {
      const r = await library(actor, where);
      if (!r.ok) return r;
      return ok({ boards: r.value.boards.slice(0, 6), canCreate: r.value.canCreate, total: r.value.boards.length });
    },

    /** Clients, spaces and projects this person may start a board in. */
    async whereCanCreate(actor: Actor): Promise<Array<{ id: string; name: string; isSpace: boolean }>> {
      const ids = await store.clients.visibleIds(clientScope(actor));
      const out: Array<{ id: string; name: string; isSpace: boolean }> = [];
      for (const id of ids) {
        const c = await clientLevel(store, actor, id);
        if (c && levelAtLeast(c.level, "edit")) out.push({ id: c.client.id, name: c.client.name, isSpace: c.client.isInternal });
      }
      return out.sort((a, b) => Number(a.isSpace) - Number(b.isSpace) || a.name.localeCompare(b.name));
    },

    async create(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      const parsed = parse(createSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      const c = await clientLevel(store, actor, v.clientId);
      if (!c) return notFound("That client");
      if (!levelAtLeast(c.level, "edit")) return forbidden("You can't start boards here. Ask for edit access.");
      if (v.projectId) {
        const p = await store.projects.findById(v.projectId, projectScope(actor), clock.today());
        if (!p || p.clientId !== c.client.id) return notFound("That project");
      }
      const id = newId();
      const elements = v.elements ?? templateScene(v.template as BoardTemplate, newId).elements;
      const scene = cleanScene(elements);
      const bytes = bytesOf(scene);
      if (bytes > MAX_SCENE_BYTES) return invalid("That's too much for one board.");
      return commit(store, async (repos) => {
        await repos.boards.create({
          id,
          clientId: c.client.id,
          projectId: v.projectId ?? null,
          title: v.title,
          section: v.section || null,
          tags: v.tags ?? [],
          scene,
          searchText: boardSearchText(elements),
          objectCount: objectCount(elements),
          sceneBytes: bytes,
          template: v.elements ? null : v.template,
          createdById: actor.personId,
          updatedById: actor.personId,
          at: clock.now(),
        });
        return change({ id }, event(actor, { id, clientId: c.client.id, title: v.title }, "board.created", { template: v.template, projectId: v.projectId ?? null, fromSelection: Boolean(v.elements) }));
      });
    },

    async open(actor: Actor, boardId: string): Promise<Result<BoardPage>> {
      const a = await access(actor, boardId);
      if (!a) return notFound("That board");
      const { board, client, level } = a;
      const [scene, versions, people, knowledge, fileKeys, project, creator, favourites, taskLinks] = await Promise.all([
        store.boards.scene(board.id),
        store.boards.versions(board.id),
        viewers(board),
        store.knowledge.list([board.clientId]),
        store.boards.fileKeys(board.id),
        board.projectId ? store.projects.findById(board.projectId, projectScope(actor), clock.today()) : Promise.resolve(null),
        board.createdById ? store.people.findById(board.createdById) : Promise.resolve(null),
        store.boards.list({ clientIds: [board.clientId], personId: actor.personId, archived: Boolean(board.archivedAt) }),
        store.boards.taskLinks(board.id),
      ]);
      // Personal: "recently opened". Not an event (like reading chat).
      await store.boards.markViewed(board.id, actor.personId, clock.now());
      const s = scene ?? { elements: [] };
      const { items, frames } = boardItems(s.elements);
      return ok({
        board: { ...board, clientName: client.name, isSpace: client.isInternal, projectName: project?.name ?? null, createdByName: creator?.fullName ?? null },
        scene: s,
        level,
        items,
        frames,
        state: await state(actor, board, items, level),
        versions,
        people: people.map((p) => ({ id: p.id, name: p.fullName })),
        brandColours: knowledge.knowledge[0]?.brandColours ?? [],
        fileKeys,
        taskLinks,
        favourite: favourites.find((f) => f.id === board.id)?.favourite ?? false,
        tooBig: board.objectCount > WARN_OBJECTS || board.sceneBytes > WARN_BYTES,
      });
    },

    /** What changes while a board is open (votes, timer, reactions, comments, a newer save): checked every few seconds. */
    async state(actor: Actor, boardId: string): Promise<Result<BoardState & { items: BoardItem[] }>> {
      const a = await access(actor, boardId);
      if (!a) return notFound("That board");
      const scene = await store.boards.scene(a.board.id);
      const { items } = boardItems(scene?.elements ?? []);
      return ok({ ...(await state(actor, a.board, items, a.level)), items });
    },

    async save(actor: Actor, raw: unknown): Promise<Result<{ version: number; tooBig: boolean }>> {
      const parsed = parse(saveSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      const a = await need(actor, v.boardId, "edit");
      if (!a.ok) return a;
      const { board } = a.value;
      const scene = cleanScene(v.elements, v.appState);
      const bytes = bytesOf(scene);
      if (bytes > MAX_SCENE_BYTES) return invalid("This board is too big to save. Move part of it to a new linked board (select, then “Move to a new board”).");
      const objects = objectCount(v.elements);
      const now = clock.now();
      return commit(store, async (repos) => {
        // Keep the state before this save as an automatic version, at most every 15 minutes, and always before a save
        // that takes away most of a sizeable board (a cleared canvas, or a mistake): it can be restored from History.
        const last = await repos.boards.lastAutoVersionAt(board.id);
        const bigDrop = board.objectCount >= BIG_DROP_MIN && objects < board.objectCount / 2;
        if (v.baseVersion === board.version && (bigDrop || !last || now.getTime() - last.getTime() >= AUTO_VERSION_MINUTES * 60_000)) {
          const before = await repos.boards.scene(board.id);
          if (before) await repos.boards.addVersion({ id: newId(), boardId: board.id, version: board.version, scene: before, name: null, objectCount: board.objectCount, createdById: actor.personId, at: now });
        }
        const version = await repos.boards.saveScene(board.id, v.baseVersion, {
          scene,
          searchText: boardSearchText(v.elements),
          objectCount: objects,
          sceneBytes: bytes,
          ...(v.thumbnail !== undefined ? { thumbnail: v.thumbnail } : {}),
          updatedById: actor.personId,
          at: now,
        });
        if (version === null) return conflict("Someone else changed this board while you were working. Reload to see their changes; your last few changes weren't saved (copy them first).");
        return change({ version, tooBig: objects > WARN_OBJECTS || bytes > WARN_BYTES }, event(actor, board, "board.saved", { version, objects }));
      });
    },

    /**
     * Stage 13.6: a change made on the server (the MCP: add stickies, a mind map, a section). Needs edit; saved like any
     * save (version check, automatic versions), with its own event. `fn` returns the new elements or a reason.
     */
    async edit(actor: Actor, boardId: string, action: string, fn: (elements: unknown[]) => { elements: unknown[]; data?: Record<string, unknown> } | string): Promise<Result<{ version: number }>> {
      const a = await need(actor, boardId, "edit");
      if (!a.ok) return a;
      const before = (await store.boards.scene(a.value.board.id)) ?? { elements: [] };
      const r = fn(before.elements as unknown[]);
      if (typeof r === "string") return invalid(r);
      const saved = await this.save(actor, { boardId, baseVersion: a.value.board.version, elements: r.elements, appState: before.appState ?? {} });
      if (!saved.ok) return saved;
      await commit(store, async () => change(null, event(actor, a.value.board, action, { version: saved.value.version, ...r.data })));
      return ok({ version: saved.value.version });
    },

    async settings(actor: Actor, raw: unknown): Promise<Result<null>> {
      const parsed = parse(settingsSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      const a = await need(actor, v.boardId, "edit");
      if (!a.ok) return a;
      const { board } = a.value;
      if (v.projectId) {
        const p = await store.projects.findById(v.projectId, projectScope(actor), clock.today());
        if (!p || p.clientId !== board.clientId) return notFound("That project");
      }
      return commit(store, async (repos) => {
        const patch = { ...(v.title ? { title: v.title } : {}), ...(v.section !== undefined ? { section: v.section || null } : {}), ...(v.tags ? { tags: [...new Set(v.tags)] } : {}), ...(v.projectId !== undefined ? { projectId: v.projectId } : {}) };
        await repos.boards.update(board.id, { ...patch, updatedById: actor.personId, at: clock.now() });
        return change(null, event(actor, board, "board.changed", { patch }));
      });
    },

    async favourite(actor: Actor, boardId: string, on: boolean): Promise<Result<null>> {
      const a = await access(actor, boardId);
      if (!a) return notFound("That board");
      // Personal, like "recently opened": no event.
      await store.boards.setFavourite(a.board.id, actor.personId, on);
      return ok(null);
    },

    async archive(actor: Actor, boardId: string, archived: boolean): Promise<Result<null>> {
      const a = await need(actor, boardId, "manage", { live: false });
      if (!a.ok) return a;
      const { board } = a.value;
      if (Boolean(board.archivedAt) === archived) return ok(null);
      return commit(store, async (repos) => {
        await repos.boards.update(board.id, { archivedAt: archived ? clock.now() : null, at: clock.now() });
        return change(null, event(actor, board, archived ? "board.archived" : "board.restored"));
      });
    },

    async snapshot(actor: Actor, boardId: string, name: string): Promise<Result<null>> {
      const label = name.trim().slice(0, 80);
      if (!label) return invalid("Give the snapshot a name, like “Before client review”.");
      const a = await need(actor, boardId, "edit");
      if (!a.ok) return a;
      const { board } = a.value;
      return commit(store, async (repos) => {
        const scene = await repos.boards.scene(board.id);
        await repos.boards.addVersion({ id: newId(), boardId: board.id, version: board.version, scene: scene ?? { elements: [] }, name: label, objectCount: board.objectCount, createdById: actor.personId, at: clock.now() });
        return change(null, event(actor, board, "board.snapshot", { name: label, version: board.version }));
      });
    },

    /** Puts an older version back; the current state is kept as a version first, so nothing is lost. */
    async restoreVersion(actor: Actor, boardId: string, versionId: string): Promise<Result<{ version: number }>> {
      const a = await need(actor, boardId, "edit");
      if (!a.ok) return a;
      const { board } = a.value;
      const old = isId(versionId) ? await store.boards.version(versionId) : null;
      if (!old || old.boardId !== board.id) return notFound("That version");
      const now = clock.now();
      return commit(store, async (repos) => {
        const current = await repos.boards.scene(board.id);
        await repos.boards.addVersion({ id: newId(), boardId: board.id, version: board.version, scene: current ?? { elements: [] }, name: `Before restoring “${old.name ?? `version ${old.version}`}”`, objectCount: board.objectCount, createdById: actor.personId, at: now });
        const elements = old.scene.elements;
        const version = await repos.boards.saveScene(board.id, board.version, { scene: old.scene, searchText: boardSearchText(elements), objectCount: objectCount(elements), sceneBytes: bytesOf(old.scene), thumbnail: null, updatedById: actor.personId, at: now });
        if (version === null) return conflict("Someone else changed this board just now. Reload and try again.");
        return change({ version }, event(actor, board, "board.version_restored", { from: old.version, name: old.name, version }));
      });
    },

    /** The facilitator starts a voting round (votes per person), reveals it, or clears it. */
    async voting(actor: Actor, boardId: string, action: { start: number } | "reveal" | "clear"): Promise<Result<null>> {
      const a = await need(actor, boardId, "edit");
      if (!a.ok) return a;
      const { board } = a.value;
      let voting: BoardRecord["voting"];
      if (action === "clear") voting = null;
      else if (action === "reveal") {
        if (!board.voting) return invalid("Start a vote first.");
        voting = { ...board.voting, open: false, revealed: true };
      } else {
        const perPerson = Math.round(action.start);
        if (!(perPerson >= 1 && perPerson <= 20)) return invalid("Give each person 1 to 20 votes.");
        voting = { round: (board.voting?.round ?? 0) + 1, perPerson, open: true, revealed: false };
      }
      return commit(store, async (repos) => {
        await repos.boards.update(board.id, { voting, at: clock.now() });
        return change(null, event(actor, board, action === "clear" ? "board.voting_cleared" : action === "reveal" ? "board.votes_revealed" : "board.voting_started", voting ? { round: voting.round, perPerson: voting.perPerson } : {}));
      });
    },

    /** One vote on a sticky (a person may put several on the same one), or takes one back. */
    async vote(actor: Actor, boardId: string, elementId: string, on: boolean): Promise<Result<null>> {
      const a = await need(actor, boardId, "view");
      if (!a.ok) return a;
      const { board } = a.value;
      const v = board.voting;
      if (!v?.open) return invalid("Voting isn't open on this board.");
      const scene = await store.boards.scene(board.id);
      if (!targetIds(scene?.elements ?? []).has(elementId)) return notFound("That sticky");
      return commit(store, async (repos) => {
        const now = clock.now();
        if (on) {
          const mine = (await repos.boards.votes(board.id, v.round)).filter((x) => x.personId === actor.personId);
          if (mine.length >= v.perPerson) return invalid(`You've used all ${v.perPerson} of your votes. Take one back to move it.`);
          await repos.boards.addVote({ id: newId(), boardId: board.id, round: v.round, elementId, personId: actor.personId, at: now });
        } else if (!(await repos.boards.removeVote(board.id, v.round, elementId, actor.personId, now))) return invalid("You haven't voted on that one.");
        return change(null, event(actor, board, on ? "board.voted" : "board.vote_taken_back", { round: v.round, elementId }));
      });
    },

    async react(actor: Actor, boardId: string, elementId: string, emoji: string): Promise<Result<{ on: boolean }>> {
      if (!(BOARD_REACTIONS as readonly string[]).includes(emoji)) return invalid("Pick one of the reactions.");
      const a = await need(actor, boardId, "comment");
      if (!a.ok) return a;
      const { board } = a.value;
      const scene = await store.boards.scene(board.id);
      if (!targetIds(scene?.elements ?? []).has(elementId)) return notFound("That sticky");
      return commit(store, async (repos) => {
        const on = await repos.boards.toggleReaction({ id: newId(), boardId: board.id, elementId, personId: actor.personId, emoji, at: clock.now() });
        return change({ on }, event(actor, board, on ? "board.reacted" : "board.reaction_removed", { elementId, emoji }));
      });
    },

    /** A comment on the board or pinned to a sticky; @mentions reach only people who can see the board. */
    async comment(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      const parsed = parse(commentSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      const a = await need(actor, v.boardId, "comment");
      if (!a.ok) return a;
      const { board } = a.value;
      if (v.elementId) {
        const scene = await store.boards.scene(board.id);
        if (!targetIds(scene?.elements ?? []).has(v.elementId)) return notFound("That sticky");
      }
      const mentions = v.body.includes("@") ? findMentions(v.body, await viewers(board)).filter((p) => p !== actor.personId) : [];
      const id = newId();
      return commit(store, async (repos) => {
        await repos.boards.addComment({ id, boardId: board.id, elementId: v.elementId ?? null, authorId: actor.personId, body: v.body, at: clock.now() });
        return change({ id }, event(actor, board, "board.commented", { commentId: id, elementId: v.elementId ?? null, excerpt: v.body.slice(0, 140), mentions, createdById: board.createdById }));
      });
    },

    async removeComment(actor: Actor, commentId: string): Promise<Result<null>> {
      const c = isId(commentId) ? await store.boards.comment(commentId) : null;
      if (!c) return notFound("That comment");
      const a = await access(actor, c.boardId);
      if (!a) return notFound("That comment");
      if (c.authorId !== actor.personId && a.level !== "manage") return forbidden("Only its writer (or the board's manager) removes a comment.");
      return commit(store, async (repos) => {
        await repos.boards.removeComment(c.id, clock.now());
        return change(null, { actorId: actor.personId, action: "board_comment.removed", entityType: "board_comment", entityId: c.id, clientId: a.board.clientId, data: { boardId: a.board.id } });
      });
    },

    /** The session timer everyone on the board sees; null stops it. */
    async timer(actor: Actor, boardId: string, set: { minutes: number; sound: boolean } | null): Promise<Result<null>> {
      const a = await need(actor, boardId, "edit");
      if (!a.ok) return a;
      const { board } = a.value;
      if (set && !(set.minutes >= 0.5 && set.minutes <= 120)) return invalid("Set 1 to 120 minutes.");
      const timer = set ? { endsAt: new Date(clock.now().getTime() + set.minutes * 60_000).toISOString(), sound: set.sound, startedById: actor.personId } : null;
      return commit(store, async (repos) => {
        await repos.boards.update(board.id, { timer, at: clock.now() });
        return change(null, event(actor, board, timer ? "board.timer_started" : "board.timer_stopped", set ? { minutes: set.minutes } : {}));
      });
    },

    /**
     * Stage 13.2: a sticky becomes a task in one of the board's client's projects, made by the task service with all
     * its checks (who may add tasks, space levels, owners outside a private space). The sticky keeps a link to it.
     */
    async stickyToTask(actor: Actor, raw: unknown): Promise<Result<{ taskId: string }>> {
      const parsed = parse(stickyTaskSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      if (!deps.tasks) return invalid("Tasks can't be made from here.");
      const a = await need(actor, v.boardId, "edit");
      if (!a.ok) return a;
      const { board } = a.value;
      const scene = await store.boards.scene(board.id);
      const item = boardItems(scene?.elements ?? []).items.find((i) => i.id === v.elementId);
      if (!item) return notFound("That sticky (save the board first)");
      if ((await store.boards.taskLinks(board.id)).some((l) => l.elementId === v.elementId)) return invalid("That sticky is already a task.");
      const project = await store.projects.findById(v.projectId, projectScope(actor), clock.today());
      if (!project || project.clientId !== board.clientId) return invalid("Pick a project of this board's client or space.");
      const title = (v.title || item.text).replace(/\s+/g, " ").trim().slice(0, 200);
      const made = await deps.tasks.create(actor, { projectId: v.projectId, title, ownerId: v.ownerId ?? "", dueDate: v.dueDate ?? "", description: `From the idea board “${board.title}”.` });
      if (!made.ok) return made;
      return commit(store, async (repos) => {
        if (!(await repos.boards.addTaskLink({ boardId: board.id, elementId: v.elementId, taskId: made.value.id, createdById: actor.personId, at: clock.now() }))) return invalid("That sticky is already a task.");
        return change({ taskId: made.value.id }, event(actor, board, "board.sticky_to_task", { elementId: v.elementId, taskId: made.value.id }));
      });
    },

    /**
     * Stage 13.1b: a list made from the board (stickies or a mind map, as Markdown) becomes a Docs page in the
     * board's client or space. Needs comment level here; the docs service checks the rest (who may write pages for
     * that client, space levels).
     */
    async toDocsPage(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      const parsed = parse(z.object({ boardId: z.uuid(), title: z.string().trim().min(1, { message: "Give the page a title." }).max(200), markdown: z.string().trim().min(1, { message: "There's nothing to put on the page." }).max(100_000) }), raw);
      if (!parsed.ok) return parsed;
      if (!deps.docs) return invalid("Docs pages can't be made from here.");
      const a = await need(actor, parsed.value.boardId, "comment");
      if (!a.ok) return a;
      const { board } = a.value;
      const body = `${parsed.value.markdown}\n\n_From the idea board “${board.title}”._`;
      return deps.docs.create(actor, { clientId: board.clientId, title: parsed.value.title, body });
    },

    /**
     * Stage 13.2: puts a live card on a board from outside the canvas ("Add to board" in the swipe file): appended to the
     * right of what's there, saved as a new version (an open editor of that board is told to reload, as for any save).
     */
    async addCard(actor: Actor, boardId: string, kind: BoardCardKind, id: string): Promise<Result<null>> {
      const a = await need(actor, boardId, "edit");
      if (!a.ok) return a;
      const { board } = a.value;
      for (let attempt = 0; attempt < 2; attempt++) {
        const fresh = await store.boards.find(board.id);
        const scene = (await store.boards.scene(board.id)) ?? { elements: [] };
        const els = scene.elements as Array<{ x?: number; y?: number; width?: number; isDeleted?: boolean }>;
        const live = els.filter((e) => !e.isDeleted && typeof e.x === "number");
        const x = live.length ? Math.max(...live.map((e) => (e.x ?? 0) + (e.width ?? 0))) + 80 : 0;
        const y = live.length ? Math.min(...live.map((e) => e.y ?? 0)) : 0;
        const card = cardElement(newId, cardUrl(kind, id), x, y, kind);
        const elements = [...scene.elements, card];
        const next = { ...scene, elements };
        const r = await commit(store, async (repos) => {
          const version = await repos.boards.saveScene(board.id, fresh!.version, { scene: next, searchText: boardSearchText(elements), objectCount: objectCount(elements), sceneBytes: bytesOf(next), updatedById: actor.personId, at: clock.now() });
          if (version === null) return conflict("busy");
          return change(null, event(actor, board, "board.card_added", { kind, id, version }));
        });
        if (r.ok || r.error.message !== "busy") return r;
      }
      return conflict("Someone is saving this board right now. Try again in a moment.");
    },

    /** An image dropped on the board, through the storage interface (resized in the browser first). */
    async addImage(actor: Actor, boardId: string, file: { key: string; contentType: string; bytes: Uint8Array }): Promise<Result<null>> {
      if (!/^[A-Za-z0-9_-]{8,100}$/.test(file.key)) return invalid("That image has no proper id.");
      if (!(IMAGE_TYPES as readonly string[]).includes(file.contentType)) return invalid("Use a PNG, JPG, WebP or GIF image.");
      if (file.bytes.length > MAX_IMAGE_BYTES) return invalid("Images up to 3.5 MB. Make it smaller first.");
      const a = await need(actor, boardId, "edit");
      if (!a.ok) return a;
      const { board } = a.value;
      if (await store.boards.file(board.id, file.key)) return ok(null);
      const stored = await storage.upload({ folder: `clients/${board.clientId}/boards/${board.id}`, name: `${file.key}.${file.contentType.split("/")[1]}`, contentType: file.contentType, bytes: file.bytes });
      return commit(store, async (repos) => {
        await repos.boards.addFile({ boardId: board.id, fileKey: file.key, contentType: file.contentType, fileProvider: stored.provider, fileLocation: stored.location, fileId: stored.fileId, fileSize: file.bytes.length, createdById: actor.personId, at: clock.now() });
        return change(null, event(actor, board, "board.image_added", { fileKey: file.key, size: file.bytes.length }));
      });
    },

    async image(actor: Actor, boardId: string, key: string): Promise<Result<{ bytes: Uint8Array; contentType: string }>> {
      const a = await access(actor, boardId);
      if (!a) return notFound("That board");
      const f = await store.boards.file(a.board.id, key);
      const read = f ? await storage.read({ provider: f.fileProvider, fileId: f.fileId }) : null;
      if (!f || !read) return notFound("That image");
      return ok({ bytes: read.bytes, contentType: f.contentType });
    },
  };
}

export type BoardsService = ReturnType<typeof createBoardsService>;
