// Docs and wiki (Stage 9b.5, ClickUp parity). Team pages everyone reads and edits (SOPs, playbooks, how-tos), and
// client pages only people on that client see. Pages nest; every save is kept, and an old version can be brought back.
// Two people editing at once: the second save is refused with "someone saved first", never silently overwritten.
import { z } from "zod";
import { isId, newId } from "@/lib/id";
import { conflict, forbidden, invalid, notFound, ok, type Result } from "@/lib/result";
import { optionalId, parse } from "@/lib/validation/common";
import type { DataStore, DocCommentRow, DocRow, DocSummary, DocVersionRow, FileStorage, NewEvent, PersonRecord, Repositories } from "@/repositories";
import { toActor } from "./identity";
import { taskScope } from "./tasks";
import { change, commit, noChange } from "./change";
import type { Clock } from "./clock";
import { can, clientScope, type Actor } from "./permissions";
import { findMentions } from "./rules/mentions";
import { DOC_TEMPLATES, templateBody } from "./rules/doc-templates";
import { levelBlocks } from "./spaces";

const MAX_BODY = 100_000;
const MAX_DEPTH = 6;

const title = z.string().trim().min(1, { message: "Give the page a title." }).max(150);
const body = z.string().max(MAX_BODY, { message: "That page is too long. Split it into smaller pages." }).default("");
const createSchema = z.object({ title, body, parentId: optionalId, clientId: optionalId, template: z.enum(DOC_TEMPLATES).optional().catch(undefined) });
const updateSchema = z.object({ docId: z.uuid(), version: z.coerce.number().int().min(1), title, body, parentId: optionalId });

export type DocTreeNode = DocSummary & { children: DocTreeNode[] };
export type DocPage = DocRow & { crumbs: Array<{ id: string; title: string }>; children: Array<{ id: string; title: string }>; canDelete: boolean };

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_IMAGE = 3_500_000;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
/** People @mentioned in a page's text (Stage 13.4). */
export const mentionedPeople = (body: string) => [...new Set([...body.matchAll(new RegExp(`@\\[[^\\]\\n]*\\]\\(person:(${UUID})\\)`, "g"))].map((m) => m[1]!))];

export function createDocService(deps: { store: DataStore; clock: Clock; storage?: FileStorage }) {
  const { store, clock } = deps;

  async function visibleClientIds(actor: Actor): Promise<readonly string[] | "all"> {
    const scope = clientScope(actor);
    if (scope.kind === "all" && !scope.viewerId) return "all";
    // Spaces included (Stage 14.1): their pages are seen like a client's, private ones only by members.
    return store.clients.visibleIds(scope);
  }
  const sees = (visible: readonly string[] | "all", clientId: string | null) => !clientId || visible === "all" || visible.includes(clientId);

  async function visibleDoc(repos: Repositories, actor: Actor, id: string): Promise<DocRow | null> {
    if (!isId(id)) return null;
    const d = await repos.docs.findById(id);
    return d && sees(await visibleClientIds(actor), d.clientId) ? d : null;
  }

  /** The pages above `id`, top first. */
  async function crumbsOf(repos: Repositories, d: Pick<DocRow, "parentId">): Promise<Array<{ id: string; title: string }>> {
    const out: Array<{ id: string; title: string }> = [];
    let parentId = d.parentId;
    for (let i = 0; parentId && i < 20; i++) {
      const p = await repos.docs.findById(parentId);
      if (!p) break;
      out.unshift({ id: p.id, title: p.title });
      parentId = p.parentId;
    }
    return out;
  }

  const mayDelete = (actor: Actor, d: Pick<DocRow, "createdById">) => d.createdById === actor.personId || can(actor, "projects.write");

  /** Can this person open the page? (A client's page: people who see that client; team pages: the team.) */
  async function canOpen(repos: Repositories, p: PersonRecord, d: Pick<DocRow, "clientId">): Promise<boolean> {
    if (p.status !== "active") return false;
    const a = toActor(p);
    if (!d.clientId) return a.employmentType !== "freelancer";
    const sc = clientScope(a);
    return sees(sc.kind === "all" && !(sc as { viewerId?: string }).viewerId ? "all" : await repos.clients.visibleIds(sc), d.clientId);
  }

  /**
   * Stage 13.4: people newly @mentioned in a page hear about it, only those who can open the page (a client's page:
   * people who see that client; private spaces: their members). Returns the event, or nothing to tell.
   */
  async function mentionEvent(repos: Repositories, actor: Actor, d: Pick<DocRow, "id" | "clientId">, title: string, before: string, after: string): Promise<NewEvent | null> {
    const had = new Set(mentionedPeople(before));
    const tell: string[] = [];
    for (const id of mentionedPeople(after).filter((p) => !had.has(p) && p !== actor.personId)) {
      const p = await repos.people.findById(id);
      if (p && (await canOpen(repos, p, d))) tell.push(id);
    }
    return tell.length ? { actorId: actor.personId, action: "doc.mentioned", entityType: "doc", entityId: d.id, clientId: d.clientId, data: { title, mentions: tell } } : null;
  }

  const service = {
    /** All pages this person can see, as a tree (team pages first, then each client's). Or matches for a search. */
    async tree(actor: Actor, opts: { search?: string } = {}): Promise<{ nodes: DocTreeNode[]; search: string }> {
      const search = (opts.search ?? "").trim().slice(0, 100);
      const rows = await store.docs.list(await visibleClientIds(actor), search ? { search } : {});
      if (search) return { nodes: rows.map((r) => ({ ...r, children: [] })), search };
      const byParent = new Map<string | null, DocSummary[]>();
      const ids = new Set(rows.map((r) => r.id));
      for (const r of rows) {
        const key = r.parentId && ids.has(r.parentId) ? r.parentId : null;
        byParent.set(key, [...(byParent.get(key) ?? []), r]);
      }
      const build = (parent: string | null, depth: number): DocTreeNode[] => (byParent.get(parent) ?? []).map((r) => ({ ...r, children: depth < MAX_DEPTH + 2 ? build(r.id, depth + 1) : [] }));
      const roots = build(null, 0).sort((a, b) => Number(Boolean(a.clientId)) - Number(Boolean(b.clientId)) || (a.clientName ?? "").localeCompare(b.clientName ?? "") || a.position - b.position || a.title.localeCompare(b.title));
      return { nodes: roots, search };
    },

    async get(actor: Actor, id: string): Promise<Result<DocPage>> {
      const d = await visibleDoc(store, actor, id);
      if (!d) return notFound("That page");
      const [crumbs, children] = await Promise.all([crumbsOf(store, d), store.docs.children(d.id)]);
      return ok({ ...d, crumbs, children, canDelete: mayDelete(actor, d) });
    },

    /** A new page: on its own, under another page (it takes that page's client), or for a client. */
    async create(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      const parsed = parse(createSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      return commit(store, async (repos) => {
        let clientId = v.clientId ?? null;
        if (v.parentId) {
          const parent = await visibleDoc(repos, actor, v.parentId);
          if (!parent) return notFound("The page to put it under");
          if ((await crumbsOf(repos, parent)).length + 1 >= MAX_DEPTH) return invalid(`Pages nest up to ${MAX_DEPTH} deep. Put it higher up.`);
          clientId = parent.clientId;
        } else if (clientId && !(await repos.clients.findById(clientId, clientScope(actor)))) {
          return notFound("That client");
        }
        if (clientId) { const blocked = await levelBlocks(repos, actor, clientId, "edit"); if (blocked) return blocked; }
        const id = newId();
        // A template only fills an empty page (Stage 13.4).
        if (v.template && !v.body.trim()) v.body = templateBody(v.template);
        await repos.docs.create({ id, title: v.title, body: v.body, parentId: v.parentId ?? null, clientId, position: 0, createdById: actor.personId });
        await repos.docs.addVersion({ id: newId(), docId: id, version: 1, title: v.title, body: v.body, editedById: actor.personId });
        const mentioned = await mentionEvent(repos, actor, { id, clientId }, v.title, "", v.body);
        return change({ id }, { actorId: actor.personId, action: "doc.created", entityType: "doc", entityId: id, clientId, data: { title: v.title } }, ...(mentioned ? [mentioned] : []));
      });
    },

    /** Save an edit. Refused when someone saved since this person opened the page. */
    async update(actor: Actor, raw: unknown): Promise<Result<{ id: string; version: number }>> {
      const parsed = parse(updateSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      return commit(store, async (repos) => {
        const d = await visibleDoc(repos, actor, v.docId);
        if (!d) return notFound("That page");
        if (d.clientId) { const blocked = await levelBlocks(repos, actor, d.clientId, "edit"); if (blocked) return blocked; }
        let parentId = d.parentId;
        if (v.parentId !== undefined && (v.parentId ?? null) !== d.parentId) {
          if (v.parentId) {
            const parent = await visibleDoc(repos, actor, v.parentId);
            if (!parent) return notFound("The page to put it under");
            if (parent.clientId !== d.clientId) return invalid("Move it under a page for the same client (or a team page under a team page).");
            const above = await crumbsOf(repos, parent);
            if (parent.id === d.id || above.some((c) => c.id === d.id)) return invalid("A page can't go under itself or one of its own pages.");
          }
          parentId = v.parentId ?? null;
        }
        if (d.title === v.title && d.body === v.body && parentId === d.parentId) return noChange({ id: d.id, version: d.version });
        if (!(await repos.docs.update(d.id, v.version, { title: v.title, body: v.body, parentId, updatedById: actor.personId }))) {
          return conflict(`${d.updatedByName ?? "Someone"} saved this page while you were editing. Copy your text, reload, and add it again.`);
        }
        const version = v.version + 1;
        await repos.docs.addVersion({ id: newId(), docId: d.id, version, title: v.title, body: v.body, editedById: actor.personId });
        const mentioned = await mentionEvent(repos, actor, d, v.title, d.body, v.body);
        return change({ id: d.id, version }, { actorId: actor.personId, action: "doc.edited", entityType: "doc", entityId: d.id, clientId: d.clientId, data: { title: v.title, version } }, ...(mentioned ? [mentioned] : []));
      });
    },

    /** Mark a team page as training (HR slice 3): for one department or everyone. HR and leads. */
    async setTraining(actor: Actor, raw: unknown): Promise<Result<null>> {
      if (!can(actor, "people.write") && !can(actor, "projects.write")) return forbidden("HR and leads build the training library.");
      const parsed = parse(z.object({ docId: z.uuid(), training: z.union([z.literal("on"), z.literal(""), z.boolean()]).optional().transform((v) => v === "on" || v === true), departmentId: optionalId }), raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      return commit(store, async (repos) => {
        const d = await visibleDoc(repos, actor, v.docId);
        if (!d) return notFound("That page");
        if (d.clientId) return invalid("Training pages are team pages, not client pages.");
        if (v.training && v.departmentId && !(await repos.people.listDepartments()).some((x) => x.id === v.departmentId)) return invalid("Pick one of the departments.");
        if (d.training === v.training && (d.departmentId ?? null) === (v.training ? (v.departmentId ?? null) : null)) return noChange(null);
        await repos.docs.setTraining(d.id, v.training, v.departmentId ?? null);
        return change(null, { actorId: actor.personId, action: v.training ? "doc.made_training" : "doc.unmade_training", entityType: "doc", entityId: d.id, data: { title: d.title, departmentId: v.departmentId ?? null } });
      });
    },

    /** The training library for a department (with everyone's training). Anyone can read it. */
    async training(actor: Actor, departmentId: string | null): Promise<Array<{ id: string; title: string; departmentId: string | null; updatedAt: Date }>> {
      // Team pages: everyone on the team reads them (freelancers work on client tasks only).
      if (actor.employmentType === "freelancer") return [];
      return store.docs.training(departmentId);
    },

    async versions(actor: Actor, id: string): Promise<Result<DocVersionRow[]>> {
      const d = await visibleDoc(store, actor, id);
      if (!d) return notFound("That page");
      return ok(await store.docs.versions(d.id));
    },

    /** Bring back an old version: saved as a new version, so nothing is lost. */
    async restore(actor: Actor, raw: unknown): Promise<Result<{ id: string; version: number }>> {
      const parsed = parse(z.object({ docId: z.uuid(), version: z.coerce.number().int().min(1) }), raw);
      if (!parsed.ok) return parsed;
      const d = await visibleDoc(store, actor, parsed.value.docId);
      if (!d) return notFound("That page");
      const old = (await store.docs.versions(d.id)).find((x) => x.version === parsed.value.version);
      if (!old) return notFound("That version");
      return service.update(actor, { docId: d.id, version: d.version, title: old.title, body: old.body });
    },

    /** People who can open the page: the @mention list for comments. */
    async mentionable(actor: Actor, docId: string): Promise<Array<{ id: string; name: string }>> {
      const d = await visibleDoc(store, actor, docId);
      if (!d) return [];
      const out: Array<{ id: string; name: string }> = [];
      for (const p of await store.people.listActive()) if (await canOpen(store, p, d)) out.push({ id: p.id, name: p.fullName });
      return out;
    },

    /** Stage 13.4: the page's comments (open ones first in the screen). */
    async comments(actor: Actor, docId: string): Promise<Result<Array<DocCommentRow & { mine: boolean }>>> {
      const d = await visibleDoc(store, actor, docId);
      if (!d) return notFound("That page");
      return ok((await store.docs.comments(d.id)).map((c) => ({ ...c, mine: c.authorId === actor.personId })));
    },

    /**
     * A comment on the page or on the words quoted from it, with @mentions ("@Anu Thomas") that reach only people who
     * can open the page. Space members at view level read comments but don't write them (14.2).
     */
    async comment(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      const parsed = parse(z.object({ docId: z.uuid(), quote: z.string().trim().max(500).optional(), body: z.string().trim().min(1, { message: "Write the comment first." }).max(4000) }), raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      return commit(store, async (repos) => {
        const d = await visibleDoc(repos, actor, v.docId);
        if (!d) return notFound("That page");
        if (d.clientId) { const blocked = await levelBlocks(repos, actor, d.clientId, "comment"); if (blocked) return blocked; }
        const people = await repos.people.listActive();
        const openers: Array<{ id: string; fullName: string }> = [];
        for (const p of people) if (await canOpen(repos, p, d)) openers.push(p);
        const mentions = v.body.includes("@") ? findMentions(v.body, openers).filter((p) => p !== actor.personId) : [];
        const id = newId();
        await repos.docs.addComment({ id, docId: d.id, quote: v.quote || null, body: v.body, authorId: actor.personId, at: clock.now() });
        const tellAuthor = d.createdById && d.createdById !== actor.personId && !mentions.includes(d.createdById) && openers.some((p) => p.id === d.createdById) ? [d.createdById] : [];
        return change(
          { id },
          { actorId: actor.personId, action: "doc.commented", entityType: "doc_comment", entityId: id, clientId: d.clientId, data: { docId: d.id, title: d.title, excerpt: v.body.slice(0, 140), notify: tellAuthor } },
          ...(mentions.length ? [{ actorId: actor.personId, action: "doc.mentioned", entityType: "doc" as const, entityId: d.id, clientId: d.clientId, data: { title: d.title, excerpt: v.body.slice(0, 140), mentions } }] : []),
        );
      });
    },

    /** Resolve (or reopen) a comment: its writer, the page's author, or someone who may edit the page. */
    async resolveComment(actor: Actor, commentId: string, resolved: boolean): Promise<Result<null>> {
      const c = isId(commentId) ? await store.docs.comment(commentId) : null;
      const d = c ? await visibleDoc(store, actor, c.docId) : null;
      if (!c || !d) return notFound("That comment");
      const blocked = d.clientId ? await levelBlocks(store, actor, d.clientId, "edit") : null;
      if (c.authorId !== actor.personId && d.createdById !== actor.personId && blocked) return forbidden("Only its writer, the page's author or an editor resolves a comment.");
      return commit(store, async (repos) => {
        await repos.docs.resolveComment(c.id, resolved ? actor.personId : null, resolved ? clock.now() : null);
        return change(null, { actorId: actor.personId, action: resolved ? "doc_comment.resolved" : "doc_comment.reopened", entityType: "doc_comment", entityId: c.id, clientId: d.clientId, data: { docId: d.id } });
      });
    },

    async removeComment(actor: Actor, commentId: string): Promise<Result<null>> {
      const c = isId(commentId) ? await store.docs.comment(commentId) : null;
      const d = c ? await visibleDoc(store, actor, c.docId) : null;
      if (!c || !d) return notFound("That comment");
      if (c.authorId !== actor.personId && !can(actor, "projects.write")) return forbidden("Only its writer (or a lead) removes a comment.");
      return commit(store, async (repos) => {
        await repos.docs.removeComment(c.id, clock.now());
        return change(null, { actorId: actor.personId, action: "doc_comment.removed", entityType: "doc_comment", entityId: c.id, clientId: d.clientId, data: { docId: d.id } });
      });
    },

    /**
     * Stage 13.4: what each task or client @mention in a page shows this viewer: its title and link, or null
     * ("No access") when they can't open it. The page itself never stores those titles.
     */
    async chips(actor: Actor, body: string): Promise<Record<string, { label: string; href: string } | null>> {
      const out: Record<string, { label: string; href: string } | null> = {};
      for (const m of body.matchAll(new RegExp(`@\\[\\]\\((task|client):(${UUID})\\)`, "g"))) {
        const [, kind, id] = m as unknown as [string, string, string];
        if (id in out) continue;
        if (kind === "task") {
          const t = await store.tasks.findById(id, taskScope(actor));
          out[id] = t ? { label: t.title, href: `/tasks/${t.id}` } : null;
        } else {
          const c = await store.clients.findById(id, clientScope(actor));
          out[id] = c ? { label: c.name, href: `/clients/${c.id}` } : null;
        }
      }
      return out;
    },

    /** Stage 13.4: a picture for a page (PNG, JPG, WebP or GIF, 3.5 MB), by people who may edit it. */
    async addImage(actor: Actor, docId: string, file: { name: string; contentType: string; bytes: Uint8Array }): Promise<Result<{ src: string }>> {
      if (!deps.storage) return invalid("Pictures can't be added here.");
      if (!IMAGE_TYPES.includes(file.contentType)) return invalid("Use a PNG, JPG, WebP or GIF picture.");
      if (file.bytes.length > MAX_IMAGE) return invalid("Pictures up to 3.5 MB.");
      const d = await visibleDoc(store, actor, docId);
      if (!d) return notFound("That page");
      if (d.clientId) { const blocked = await levelBlocks(store, actor, d.clientId, "edit"); if (blocked) return blocked; }
      const stored = await deps.storage.upload({ folder: d.clientId ? `clients/${d.clientId}/docs` : "docs", name: file.name.slice(0, 120) || "picture", contentType: file.contentType, bytes: file.bytes });
      const id = newId();
      return commit(store, async (repos) => {
        await repos.docs.addFile({ id, docId: d.id, fileProvider: stored.provider, fileLocation: stored.location, fileId: stored.fileId, contentType: file.contentType, size: file.bytes.length, createdById: actor.personId });
        return change({ src: `/api/doc-files/${id}` }, { actorId: actor.personId, action: "doc.image_added", entityType: "doc", entityId: d.id, clientId: d.clientId, data: { fileId: id, size: file.bytes.length } });
      });
    },

    /** A page's picture, for people who can open the page. */
    async image(actor: Actor, fileId: string): Promise<Result<{ bytes: Uint8Array; contentType: string }>> {
      const f = isId(fileId) ? await store.docs.file(fileId) : null;
      if (!f || !(await visibleDoc(store, actor, f.docId)) || !deps.storage) return notFound("That picture");
      const read = await deps.storage.read({ provider: f.fileProvider, fileId: f.fileId });
      return read ? ok({ bytes: read.bytes, contentType: f.contentType }) : notFound("That picture");
    },

    /** Archive a page (who wrote it, or a lead). Pages under it must be moved or archived first. */
    async remove(actor: Actor, id: string): Promise<Result<null>> {
      return commit(store, async (repos) => {
        const d = await visibleDoc(repos, actor, id);
        if (!d) return notFound("That page");
        if (!mayDelete(actor, d)) return forbidden("Only who started the page, or a lead, can archive it.");
        if (d.clientId) { const blocked = await levelBlocks(repos, actor, d.clientId, "edit"); if (blocked) return blocked; }
        if ((await repos.docs.children(d.id)).length) return conflict("Move or archive the pages under it first.");
        await repos.docs.remove(d.id, clock.now());
        return change(null, { actorId: actor.personId, action: "doc.archived", entityType: "doc", entityId: d.id, clientId: d.clientId, data: { title: d.title } });
      });
    },
  };
  return service;
}

export type DocService = ReturnType<typeof createDocService>;
