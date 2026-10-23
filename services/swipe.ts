// The swipe file (Stage 13.2): references the team saves for inspiration, per client or space, with notes and tags.
//   - A link gets a preview read by the public-web adapter (https and public hosts only, D-13.2b), kept a day.
//     YouTube plays from youtube-nocookie; Instagram and Facebook use Meta's official oEmbed when a token allows it,
//     otherwise a card with "Open on Instagram/Facebook". Other people's media is never downloaded.
//   - Screenshots upload through the storage interface (3.5 MB); the team's own videos only when files are kept in
//     Google Drive (the database keeps files up to 3.5 MB), otherwise "save a link to the video".
//   - Who: anyone who can comment on a client's or space's boards saves and edits there (14.2 levels); everyone who
//     sees the client sees its items; private spaces stay private. Removing: whoever saved it, or a manager.
//   - Share to Oppllo: what a phone shares waits in its owner's inbox until they pick the client and board.
// Every change is an event.
import { z } from "zod";
import { isId, newId } from "@/lib/id";
import { forbidden, invalid, notFound, ok, type Result } from "@/lib/result";
import { SWIPE_KINDS, type AccessLevel, type SwipeKind } from "@/lib/types";
import { parse } from "@/lib/validation/common";
import type { DataStore, FileStorage, NewEvent, PublicWeb, ShareRecord, SwipeItemRecord } from "@/repositories";
import { clientLevel } from "./boards";
import { change, commit } from "./change";
import type { Clock } from "./clock";
import { clientScope, type Actor } from "./permissions";
import { levelAtLeast } from "./rules/boards";
import { checkPublicUrl, classifyLink, MAX_SWIPE_IMAGE_BYTES, MAX_SWIPE_VIDEO_BYTES, parsePreview, PREVIEW_CACHE_HOURS, SWIPE_IMAGE_TYPES, SWIPE_VIDEO_TYPES, youtubeEmbed } from "./rules/references";

export type SwipeView = Omit<SwipeItemRecord, "fileLocation" | "fileId" | "fileProvider"> & {
  /** YouTube's no-cookie player, when it's a YouTube video. */
  embedUrl: string | null;
  /** Our own copy (a screenshot or the team's video). */
  fileUrl: string | null;
  canEdit: boolean;
};
type Preview = { kind: SwipeKind; title: string; description: string | null; imageUrl: string | null; site: string | null; embedHtml: string | null };
type BoardAdder = { addCard(actor: Actor, boardId: string, kind: "ref", id: string): Promise<Result<null>> };

const tagList = z
  .array(z.string().trim().toLowerCase().min(1).max(30))
  .max(12)
  .optional()
  .default([])
  .transform((t) => [...new Set(t)]);
const linkSchema = z.object({ clientId: z.uuid({ message: "Pick a client or space." }), url: z.string().trim().min(8, { message: "Paste the link." }).max(2000), notes: z.string().trim().max(2000).optional().default(""), tags: tagList, boardId: z.uuid().optional() });
const editSchema = z.object({ id: z.uuid(), title: z.string().trim().min(1).max(300), notes: z.string().trim().max(2000), tags: tagList });
const shareSchema = z.object({ url: z.string().trim().max(2000).optional().default(""), title: z.string().trim().max(300).optional().default(""), text: z.string().trim().max(2000).optional().default("") });
const useShareSchema = z.object({ shareId: z.uuid(), clientId: z.uuid({ message: "Pick a client or space." }), boardId: z.uuid().optional(), notes: z.string().trim().max(2000).optional().default(""), tags: tagList });

const searchTextOf = (i: { title: string; description: string | null; notes: string; tags: string[]; site: string | null; url: string | null }) => [i.title, i.description, i.notes, i.tags.join(" "), i.site, i.url].filter(Boolean).join("\n").slice(0, 20_000);
/** The first web address in shared text (Android often puts the link there). */
export const firstUrl = (text: string) => /https?:\/\/[^\s<>"']+/i.exec(text)?.[0] ?? null;

export function createSwipeService(deps: { store: DataStore; clock: Clock; storage: FileStorage; web: PublicWeb; boards?: BoardAdder }) {
  const { store, clock, storage, web } = deps;

  async function level(actor: Actor, clientId: string): Promise<AccessLevel | null> {
    return (await clientLevel(store, actor, clientId))?.level ?? null;
  }
  async function visible(actor: Actor, id: string): Promise<SwipeItemRecord | null> {
    const i = isId(id) ? await store.swipe.find(id) : null;
    return i && (await level(actor, i.clientId)) ? i : null;
  }
  const view = (actor: Actor, l: AccessLevel | null) => (i: SwipeItemRecord): SwipeView => {
    const { fileLocation: _l, fileId, fileProvider: _p, ...rest } = i;
    const yt = i.kind === "youtube" && i.url ? classifyLink(new URL(i.url)) : null;
    return { ...rest, embedUrl: yt?.kind === "youtube" ? youtubeEmbed(yt.videoId) : null, fileUrl: fileId ? `/api/swipe/${i.id}/file` : null, canEdit: i.createdById === actor.personId || (l !== null && levelAtLeast(l, "manage")) };
  };
  const event = (actor: Actor, i: { id: string; clientId: string; title: string; kind: SwipeKind }, action: string, data: Record<string, unknown> = {}): NewEvent => ({ actorId: actor.personId, action, entityType: "swipe_item", entityId: i.id, clientId: i.clientId, data: { title: i.title, kind: i.kind, ...data } });

  /** What a link is and what it shows, read once a day at most. */
  async function preview(url: URL): Promise<Preview> {
    const key = url.toString();
    const cached = (await store.swipe.previewGet(key, new Date(clock.now().getTime() - PREVIEW_CACHE_HOURS * 3_600_000))) as Preview | null;
    if (cached) return cached;
    const c = classifyLink(url);
    const host = url.hostname.replace(/^www\./, "");
    let p: Preview;
    if (c.kind === "youtube") {
      const r = await web.youtube(key);
      p = { kind: "youtube", title: (r.ok && r.value.title) || "YouTube video", description: r.ok && r.value.author ? `by ${r.value.author}` : null, imageUrl: null, site: "YouTube", embedHtml: null };
    } else if (c.kind === "instagram" || c.kind === "facebook") {
      const r = await web.metaEmbed(key, c.kind);
      const site = c.kind === "instagram" ? "Instagram" : "Facebook";
      // Without Meta's oEmbed access: a card with "Open on Instagram", never a copy of the post.
      p = r.ok ? { kind: c.kind, title: r.value.title || (r.value.author ? `${site} post by ${r.value.author}` : `${site} post`), description: r.value.author, imageUrl: null, site, embedHtml: r.value.html } : { kind: c.kind, title: `${site} post`, description: null, imageUrl: null, site, embedHtml: null };
    } else {
      const r = await web.page(key);
      const pv = r.ok ? parsePreview(r.value.html, r.value.url) : null;
      p = { kind: "link", title: pv?.title || host, description: pv?.description ?? null, imageUrl: pv?.image ?? null, site: pv?.site ?? host, embedHtml: null };
    }
    await store.swipe.previewPut(key, p, clock.now());
    return p;
  }

  async function addItem(actor: Actor, row: Omit<SwipeItemRecord, "clientName" | "createdByName" | "createdAt" | "updatedAt" | "createdById" | "id">, boardId?: string): Promise<Result<{ id: string; boardResult?: string }>> {
    const id = newId();
    const saved = await commit(store, async (repos) => {
      await repos.swipe.add({ ...row, id, createdById: actor.personId, searchText: searchTextOf(row), at: clock.now() });
      return change({ id }, event(actor, { id, clientId: row.clientId, title: row.title, kind: row.kind }, "swipe_item.saved", { url: row.url, boardId: boardId ?? null }));
    });
    if (!saved.ok || !boardId || !deps.boards) return saved;
    const added = await deps.boards.addCard(actor, boardId, "ref", id);
    return ok({ id, ...(added.ok ? {} : { boardResult: added.error.message }) });
  }

  const noFile = { fileProvider: null, fileLocation: null, fileId: null, fileName: null, fileSize: null, contentType: null } as const;

  async function saveLinkFor(actor: Actor, v: z.infer<typeof linkSchema>): Promise<Result<{ id: string; boardResult?: string }>> {
    const l = await level(actor, v.clientId);
    if (!l) return notFound("That client");
    if (!levelAtLeast(l, "comment")) return forbidden("Your access here is view only, so you can't save references.");
    const check = checkPublicUrl(v.url);
    if (!check.ok) return invalid(check.reason, { url: [check.reason] });
    const p = await preview(check.url);
    return addItem(actor, { ...noFile, clientId: v.clientId, boardId: v.boardId ?? null, kind: p.kind, url: check.url.toString(), title: p.title, description: p.description, imageUrl: p.imageUrl, site: p.site, embedHtml: p.embedHtml, notes: v.notes, tags: v.tags }, v.boardId);
  }

  async function saveFileFor(actor: Actor, input: { clientId: string; notes: string; tags: string[]; boardId?: string }, file: { name: string; contentType: string; bytes: Uint8Array }): Promise<Result<{ id: string; boardResult?: string }>> {
    const l = await level(actor, input.clientId);
    if (!l) return notFound("That client");
    if (!levelAtLeast(l, "comment")) return forbidden("Your access here is view only, so you can't save references.");
    const isVideo = (SWIPE_VIDEO_TYPES as readonly string[]).includes(file.contentType);
    const isImage = (SWIPE_IMAGE_TYPES as readonly string[]).includes(file.contentType);
    if (!isVideo && !isImage) return invalid("Save a screenshot (PNG, JPG, WebP, GIF) or a video (MP4, MOV, WebM).");
    if (isVideo && storage.provider !== "google_drive") return invalid("Videos need files kept in Google Drive (the database holds files up to 3.5 MB). Save a link to the video instead: paste it in Add a link.");
    if (file.bytes.length > (isVideo ? MAX_SWIPE_VIDEO_BYTES : MAX_SWIPE_IMAGE_BYTES)) return invalid(isVideo ? "Videos up to 4 MB for now. Save a link to a bigger one." : "Screenshots up to 3.5 MB.");
    const stored = await storage.upload({ folder: `clients/${input.clientId}/swipe`, name: file.name.slice(0, 120) || "reference", contentType: file.contentType, bytes: file.bytes });
    return addItem(
      actor,
      { clientId: input.clientId, boardId: input.boardId ?? null, kind: isVideo ? "video" : "image", url: null, title: file.name.replace(/\.[^.]+$/, "").slice(0, 300) || (isVideo ? "Video" : "Screenshot"), description: null, imageUrl: null, site: null, embedHtml: null, fileProvider: stored.provider, fileLocation: stored.location, fileId: stored.fileId, fileName: file.name.slice(0, 200), fileSize: file.bytes.length, contentType: file.contentType, notes: input.notes, tags: input.tags },
      input.boardId,
    );
  }

  return {
    /** Clients and spaces this person may save references to (comment level or above). */
    async places(actor: Actor): Promise<Array<{ id: string; name: string; isSpace: boolean }>> {
      const out: Array<{ id: string; name: string; isSpace: boolean }> = [];
      for (const c of await store.clients.list(clientScope(actor))) {
        const l = await level(actor, c.id);
        if (l && levelAtLeast(l, "comment")) out.push({ id: c.id, name: c.name, isSpace: c.isInternal });
      }
      return out.sort((a, b) => Number(a.isSpace) - Number(b.isSpace) || a.name.localeCompare(b.name));
    },

    /** The team's own videos can be uploaded only when files are kept in Google Drive. */
    videoUploads: () => storage.provider === "google_drive",

    /** Save a link (with its preview), optionally straight onto a board. */
    async saveLink(actor: Actor, raw: unknown) {
      const parsed = parse(linkSchema, raw);
      return parsed.ok ? saveLinkFor(actor, parsed.value) : parsed;
    },

    /** A screenshot, or the team's own video when files are in Drive. */
    async saveFile(actor: Actor, raw: unknown, file: { name: string; contentType: string; bytes: Uint8Array }) {
      const parsed = parse(linkSchema.omit({ url: true }), raw);
      return parsed.ok ? saveFileFor(actor, parsed.value, file) : parsed;
    },

    /** The swipe file: every client and space the person sees, filtered. */
    async search(actor: Actor, f: { clientId?: string; q?: string; tag?: string; kind?: string; savedBy?: string; from?: string; to?: string } = {}) {
      const all = await store.clients.visibleIds(clientScope(actor));
      const clientIds = f.clientId ? all.filter((c) => c === f.clientId) : all;
      const kind = (SWIPE_KINDS as readonly string[]).includes(f.kind ?? "") ? (f.kind as SwipeKind) : undefined;
      const date = (s?: string, end = false) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T${end ? "23:59:59" : "00:00:00"}+05:30`) : undefined);
      const [items, tags, savers, clients] = await Promise.all([
        store.swipe.list({ clientIds, ...(f.q ? { q: f.q.slice(0, 100) } : {}), ...(f.tag ? { tag: f.tag } : {}), ...(kind ? { kind } : {}), ...(f.savedBy && isId(f.savedBy) ? { createdById: f.savedBy } : {}), ...(date(f.from) ? { from: date(f.from)! } : {}), ...(date(f.to, true) ? { to: date(f.to, true)! } : {}) }),
        store.swipe.tags(all),
        store.swipe.savers(all),
        store.clients.list(clientScope(actor)),
      ]);
      const levels = new Map<string, AccessLevel | null>();
      for (const c of new Set(items.map((i) => i.clientId))) levels.set(c, await level(actor, c));
      return ok({ items: items.map((i) => view(actor, levels.get(i.clientId) ?? null)(i)), tags, savers, clients: clients.filter((c) => all.includes(c.id)).map((c) => ({ id: c.id, name: c.name, isSpace: c.isInternal })) });
    },

    async get(actor: Actor, id: string): Promise<SwipeView | null> {
      const i = await visible(actor, id);
      return i ? view(actor, await level(actor, i.clientId))(i) : null;
    },

    async edit(actor: Actor, raw: unknown): Promise<Result<null>> {
      const parsed = parse(editSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      const i = await visible(actor, v.id);
      if (!i) return notFound("That reference");
      const l = await level(actor, i.clientId);
      if (!l || !levelAtLeast(l, "comment")) return forbidden("Your access here is view only.");
      return commit(store, async (repos) => {
        await repos.swipe.update(i.id, { title: v.title, notes: v.notes, tags: v.tags, searchText: searchTextOf({ ...i, ...v }), at: clock.now() });
        return change(null, event(actor, i, "swipe_item.changed", { notes: v.notes, tags: v.tags }));
      });
    },

    async remove(actor: Actor, id: string): Promise<Result<null>> {
      const i = await visible(actor, id);
      if (!i) return notFound("That reference");
      if (!view(actor, await level(actor, i.clientId))(i).canEdit) return forbidden("Only whoever saved it (or the space's manager) removes it.");
      return commit(store, async (repos) => {
        await repos.swipe.remove(i.id, clock.now());
        return change(null, event(actor, i, "swipe_item.removed"));
      });
    },

    async addToBoard(actor: Actor, id: string, boardId: string): Promise<Result<null>> {
      const i = await visible(actor, id);
      if (!i) return notFound("That reference");
      if (!deps.boards) return invalid("Boards aren't available here.");
      return deps.boards.addCard(actor, boardId, "ref", i.id);
    },

    /** A screenshot or video, for people who see its client. */
    async file(actor: Actor, id: string): Promise<Result<{ bytes: Uint8Array; contentType: string }>> {
      const i = await visible(actor, id);
      const f = i?.fileId && i.fileProvider ? await storage.read({ provider: i.fileProvider, fileId: i.fileId }) : null;
      if (!i || !f) return notFound("That file");
      return ok({ bytes: f.bytes, contentType: i.contentType ?? f.contentType });
    },

    // ---------- Share to Oppllo ----------

    /** What a phone shared (link, text, a picture): kept for its owner until they say where it goes. */
    async receiveShare(actor: Actor, raw: unknown, file?: { name: string; contentType: string; bytes: Uint8Array } | null): Promise<Result<{ id: string }>> {
      const parsed = parse(shareSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      const url = v.url || firstUrl(v.text) || "";
      if (url && !/^https?:\/\//i.test(url)) return invalid("That shared link isn't a web address.");
      if (!url && !file) return invalid("Nothing came through to save: share a link or a picture.");
      if (file) {
        if (!(SWIPE_IMAGE_TYPES as readonly string[]).includes(file.contentType)) return invalid("Share a picture (PNG, JPG, WebP, GIF) or a link.");
        if (file.bytes.length > MAX_SWIPE_IMAGE_BYTES) return invalid("Pictures up to 3.5 MB.");
      }
      const stored = file ? await storage.upload({ folder: `people/${actor.personId}/shared`, name: file.name.slice(0, 120) || "shared", contentType: file.contentType, bytes: file.bytes }) : null;
      const id = newId();
      return commit(store, async (repos) => {
        await repos.swipe.shareAdd({ id, personId: actor.personId, url: url || null, title: v.title || null, text: v.text || null, fileProvider: stored?.provider ?? null, fileLocation: stored?.location ?? null, fileId: stored?.fileId ?? null, fileName: file?.name.slice(0, 200) ?? null, fileSize: file?.bytes.length ?? null, contentType: file?.contentType ?? null, at: clock.now() });
        return change({ id }, { actorId: actor.personId, action: "swipe.share_received", entityType: "swipe_item", entityId: id, clientId: null, data: { url: url || null, picture: Boolean(file) } });
      });
    },

    /** The person's own waiting share. */
    async share(actor: Actor, id: string): Promise<ShareRecord | null> {
      const s = isId(id) ? await store.swipe.share(id) : null;
      return s && s.personId === actor.personId && !s.usedAt ? s : null;
    },

    /** Files the share into a client's or space's swipe file, and onto a board when one is picked. */
    async useShare(actor: Actor, raw: unknown): Promise<Result<{ id: string; boardResult?: string }>> {
      const parsed = parse(useShareSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      const s = await store.swipe.share(v.shareId);
      if (!s || s.personId !== actor.personId || s.usedAt) return notFound("That shared item");
      let r: Result<{ id: string; boardResult?: string }>;
      if (s.fileId && s.fileProvider) {
        const f = await storage.read({ provider: s.fileProvider, fileId: s.fileId });
        if (!f) return notFound("The shared picture");
        r = await saveFileFor(actor, { clientId: v.clientId, notes: [v.notes, s.text].filter(Boolean).join("\n"), tags: v.tags, ...(v.boardId ? { boardId: v.boardId } : {}) }, { name: s.fileName ?? "shared", contentType: s.contentType ?? f.contentType, bytes: f.bytes });
      } else r = await saveLinkFor(actor, { clientId: v.clientId, url: s.url ?? "", notes: v.notes, tags: v.tags, ...(v.boardId ? { boardId: v.boardId } : {}) });
      if (r.ok) await store.swipe.shareUsed(s.id, clock.now());
      return r;
    },
  };
}

export type SwipeService = ReturnType<typeof createSwipeService>;
