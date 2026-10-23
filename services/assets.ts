// Creatives (plan/3-projects-module.md, "Creative approval"; Stage 7.2, D80): an asset with every version kept, a
// thread per version, and a review that ends approved or with changes asked. Rules are in rules/assets.ts.
//
// Who: strategists, performance marketers and the owner see every client's creatives; designers, video editors and
// social media see their clients' (assets.read); interns see the creatives on their own tasks. The BDO, HR and the
// accountant see none (plan/3: no creative files in progress). Makers send work for review; assets.approve reviews it.

import { formatFileSize } from "@/lib/format";
import { isId, newId } from "@/lib/id";
import { conflict, forbidden, invalid, notFound, ok, type Result } from "@/lib/result";
import { APPROVAL_STATE_LABELS, type ApprovalState, type AssetKind, type ReviewAction } from "@/lib/types";
import { addVersionSchema, assetCommentSchema, createAssetSchema, reviewSchema } from "@/lib/validation/assets";
import { parse } from "@/lib/validation/common";
import type { AssetCommentRecord, AssetRecord, AssetScope, AssetSummary, AssetVersionRecord, DataStore, FileStorage, NewEvent, Repositories, StoredFile } from "@/repositories";
import { change, commit } from "./change";
import type { Clock } from "./clock";
import { can, clientScope, everything, type Actor } from "./permissions";
import { levelBlocks } from "./spaces";
import { availableActions, nextState, REVIEW_STEPS, stateAfterNewVersion } from "./rules/assets";
import { MAX_DOCUMENT_BYTES, sniffDocumentType } from "./rules/documents";
import { readyOnApproval } from "./content";
import { taskScope } from "./tasks";

/** Creative links last an hour: long enough to review a page of versions, unlike HR documents (D78). */
const LINK_SECONDS = 60 * 60;
const IN_PROGRESS: ApprovalState[] = ["draft", "internal_review", "client_review", "changes_requested"];

export function assetScope(actor: Actor): AssetScope {
  if (can(actor, "assets.read") && can(actor, "clients.read.all")) return everything(actor);
  if (can(actor, "assets.read")) return { kind: "assigned", personId: actor.personId };
  // Interns make creatives on their own tasks; nobody else without assets.read sees any (plan/3).
  return actor.roles.includes("intern") ? { kind: "own", personId: actor.personId } : { kind: "none" };
}

/** Makes creatives at all: assets.write, or an intern on their own tasks. */
const makesCreatives = (actor: Actor) => can(actor, "assets.write") || actor.roles.includes("intern");

/** Makes the work: anyone with assets.write who can see it, or whoever owns its task or made it. */
const canMake = (actor: Actor, a: Pick<AssetRecord, "taskOwnerId" | "createdById">) =>
  can(actor, "assets.write") || (makesCreatives(actor) && (a.taskOwnerId === actor.personId || a.createdById === actor.personId));
const canReview = (actor: Actor) => can(actor, "assets.approve");

export type VersionView = AssetVersionRecord & {
  /** Where to open it: the app's signed link, or the link it was added as. Null when its store isn't connected. */
  link: string | null;
  isLink: boolean;
  isApproved: boolean;
  comments: AssetCommentRecord[];
};

export type AssetPage = {
  asset: AssetRecord;
  versions: VersionView[];
  actions: ReviewAction[];
  canMake: boolean;
  canReview: boolean;
};

export type AssetList = { assets: AssetSummary[]; counts: Partial<Record<ApprovalState, number>>; canCreate: boolean };

export type FileInput = { name: string; bytes: Uint8Array } | null;

export function createAssetService(deps: { store: DataStore; storage: FileStorage; clock: Clock }) {
  const { store, storage } = deps;

  const event = (actor: Actor, a: { id: string; clientId: string }, action: string, data: Record<string, unknown> = {}): NewEvent => ({
    actorId: actor.personId,
    action,
    entityType: "asset",
    entityId: a.id,
    clientId: a.clientId,
    data,
  });

  /** A file or a link, never both, never neither. Files are checked by their bytes (same rules as the locker). */
  function checkSource(file: FileInput, link: string | null): Result<{ kind: AssetKind; type: ReturnType<typeof sniffDocumentType> }> {
    if (file && link) return invalid("Add a file or a link, not both.", { link: ["Clear the link, or remove the file."] });
    if (!file) return link ? ok({ kind: "link", type: null }) : invalid("Add the file, or a link to it.", { file: ["Choose a file, or paste a link below."] });
    if (file.bytes.byteLength > MAX_DOCUMENT_BYTES) {
      const size = formatFileSize(file.bytes.byteLength);
      return invalid(`That file is ${size}; the limit is ${formatFileSize(MAX_DOCUMENT_BYTES)}.`, { file: [`${size} is too big to upload. Put it in Drive and paste the link instead.`] });
    }
    const type = sniffDocumentType(file.bytes);
    if (!type) return invalid("That file type isn't accepted.", { file: ["Upload a JPEG, PNG, WebP, PDF or Word file, or paste a link to anything else."] });
    return ok({ kind: type.contentType.startsWith("image/") ? "image" : "document", type });
  }

  /** Stores the file (outside the transaction) and returns the version's pointer fields. */
  async function storeSource(clientId: string, assetId: string, file: FileInput, link: string | null, type: ReturnType<typeof sniffDocumentType>) {
    if (!file || !type) {
      const url = link!;
      return { stored: null, pointer: { provider: "external_link" as const, location: url, fileId: url, fileName: linkName(url), mimeType: null, sizeBytes: null } };
    }
    const name = file.name.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f"<>:|?*]/g, "").slice(0, 120) || `creative.${type.extension}`;
    const stored = await storage.upload({ folder: `clients/${clientId}/assets/${assetId}`, name, contentType: type.contentType, bytes: file.bytes });
    return { stored, pointer: { provider: stored.provider, location: stored.location, fileId: stored.fileId, fileName: name, mimeType: type.contentType, sizeBytes: stored.sizeBytes } };
  }

  /** Runs a write that follows an upload; if it fails, the file is taken out of use again. */
  async function afterUpload<T>(stored: StoredFile | null, write: () => Promise<Result<T>>): Promise<Result<T>> {
    try {
      const r = await write();
      if (!r.ok && stored) await storage.delete(stored);
      return r;
    } catch (err) {
      if (stored) await storage.delete(stored).catch(() => {});
      throw err;
    }
  }

  async function linkFor(actor: Actor, v: AssetVersionRecord): Promise<string | null> {
    if (v.provider === "external_link") return v.location;
    try {
      return await storage.getLink(v, { expiresInSeconds: LINK_SECONDS, downloadName: v.fileName, viewerId: actor.personId });
    } catch {
      return null;
    }
  }

  return {
    /** Creatives the person can see: in progress by default, or one state; optionally one client. */
    async list(actor: Actor, opts: { clientId?: string; state?: string } = {}): Promise<Result<AssetList>> {
      const scope = assetScope(actor);
      if (opts.clientId && !isId(opts.clientId)) return notFound("That client");
      const state = opts.state as ApprovalState | "all" | undefined;
      const states = !state ? IN_PROGRESS : state === "all" ? undefined : [state];
      const [assets, counts] = await Promise.all([
        store.assets.list({ scope, ...(opts.clientId ? { clientId: opts.clientId } : {}), ...(states ? { states } : {}) }),
        store.assets.countByState({ scope, ...(opts.clientId ? { clientId: opts.clientId } : {}) }),
      ]);
      return ok({ assets, counts, canCreate: can(actor, "assets.write") });
    },

    /** The creatives on one task (the task page). */
    async forTask(actor: Actor, taskId: string): Promise<Result<AssetSummary[]>> {
      if (!isId(taskId)) return notFound("That task");
      return ok(await store.assets.list({ scope: assetScope(actor), taskId, limit: 50 }));
    },

    /** How many creatives wait on this reviewer (My Day). Zero for people who don't review. */
    async waitingForReview(actor: Actor): Promise<{ review: number; withClient: number }> {
      if (!canReview(actor)) return { review: 0, withClient: 0 };
      const counts = await store.assets.countByState({ scope: assetScope(actor) });
      return { review: counts.internal_review ?? 0, withClient: counts.client_review ?? 0 };
    },

    async page(actor: Actor, assetId: string): Promise<Result<AssetPage>> {
      if (!isId(assetId)) return notFound("That creative");
      const asset = await store.assets.findById(assetId, assetScope(actor));
      if (!asset) return notFound("That creative");
      const [versions, comments] = await Promise.all([store.assets.listVersions(asset.id), store.assets.listComments(asset.id)]);
      const views = await Promise.all(
        versions.map(async (v) => ({
          ...v,
          link: await linkFor(actor, v),
          isLink: v.provider === "external_link",
          isApproved: v.id === asset.approvedVersionId,
          comments: comments.filter((c) => c.versionId === v.id),
        })),
      );
      const make = canMake(actor, asset);
      const review = canReview(actor);
      return ok({
        asset,
        versions: views,
        actions: availableActions({ state: asset.approvalState, internalClient: asset.clientIsInternal, hasVersion: versions.length > 0, canMake: make, canReview: review }),
        canMake: make,
        canReview: review,
      });
    },

    /** A new creative with its first version: on a task (its client and project come from it), or for a client. */
    async create(actor: Actor, raw: unknown, file: FileInput): Promise<Result<{ id: string }>> {
      const parsed = parse(createAssetSchema, raw);
      if (!parsed.ok) return parsed;
      const input = parsed.value;
      let clientId = input.clientId;
      let projectId = input.projectId;
      if (input.taskId) {
        const task = await store.tasks.findById(input.taskId, taskScope(actor));
        if (!task) return notFound("That task");
        if (!can(actor, "assets.write") && !(makesCreatives(actor) && task.ownerId === actor.personId)) return forbidden("Add creatives to your own tasks, or ask the task's owner.");
        clientId = task.clientId;
        projectId = task.projectId;
        { const blocked = await levelBlocks(store, actor, clientId, "edit"); if (blocked) return blocked; }
      } else {
        if (!can(actor, "assets.write")) return forbidden("Add creatives from one of your tasks.");
        if (!(await store.clients.findById(clientId, clientScope(actor)))) return notFound("That client");
        { const blocked = await levelBlocks(store, actor, clientId, "edit"); if (blocked) return blocked; }
        if (projectId) {
          const project = await store.projects.findById(projectId, { kind: "all" }, deps.clock.today());
          if (!project || project.clientId !== clientId) return invalid("Pick one of this client's projects.", { projectId: ["Pick one of this client's projects."] });
        }
      }
      const source = checkSource(file, input.link);
      if (!source.ok) return source;
      const id = newId();
      const { stored, pointer } = await storeSource(clientId, id, file, input.link, source.value.type);
      const kind = input.kind ?? source.value.kind;
      return afterUpload(stored, () =>
        commit(store, async (repos) => {
          const state = stateAfterNewVersion(input.submit);
          await repos.assets.create(id, { clientId, projectId, taskId: input.taskId, title: input.title, kind, approvalState: state, currentVersion: 1, createdById: actor.personId });
          const versionId = newId();
          await repos.assets.addVersion(versionId, { assetId: id, version: 1, ...pointer, note: input.note, uploadedById: actor.personId });
          if (input.submit) await repos.assets.addComment({ id: newId(), assetId: id, versionId, authorId: actor.personId, action: "submit", body: "", atSeconds: null });
          return change({ id }, event(actor, { id, clientId }, "asset.created", { title: input.title, kind, submitted: input.submit }));
        }),
      );
    },

    /** The next version. It starts the review again; the approved one stays approved until a newer one is. */
    async addVersion(actor: Actor, raw: unknown, file: FileInput): Promise<Result<{ version: number }>> {
      const parsed = parse(addVersionSchema, raw);
      if (!parsed.ok) return parsed;
      const input = parsed.value;
      const asset = await store.assets.findById(input.assetId, assetScope(actor));
      if (!asset) return notFound("That creative");
      if (!canMake(actor, asset)) return forbidden("Only the people making this creative add versions.");
      { const blocked = await levelBlocks(store, actor, asset.clientId, "edit"); if (blocked) return blocked; }
      const source = checkSource(file, input.link);
      if (!source.ok) return source;
      const { stored, pointer } = await storeSource(asset.clientId, asset.id, file, input.link, source.value.type);
      return afterUpload(stored, () =>
        commit(store, async (repos) => {
          await repos.assets.lockForUpdate(asset.id);
          const fresh = await repos.assets.findById(asset.id, { kind: "all" });
          if (!fresh) return notFound("That creative");
          const version = fresh.currentVersion + 1;
          const versionId = newId();
          await repos.assets.addVersion(versionId, { assetId: asset.id, version, ...pointer, note: input.note, uploadedById: actor.personId });
          await repos.assets.update(asset.id, { currentVersion: version, approvalState: stateAfterNewVersion(input.submit) });
          if (input.submit) await repos.assets.addComment({ id: newId(), assetId: asset.id, versionId, authorId: actor.personId, action: "submit", body: "", atSeconds: null });
          return change({ version }, event(actor, asset, "asset.version_added", { version, submitted: input.submit }));
        }),
      );
    },

    /** One review step on the current version, with its note (required when asking for changes). */
    async review(actor: Actor, raw: unknown): Promise<Result<{ state: ApprovalState }>> {
      const parsed = parse(reviewSchema, raw);
      if (!parsed.ok) return parsed;
      const { assetId, versionId, action, note } = parsed.value;
      const step = REVIEW_STEPS[action];
      const visible = await store.assets.findById(assetId, assetScope(actor));
      if (!visible) return notFound("That creative");
      if (step.by === "reviewer" ? !canReview(actor) : !canMake(actor, visible)) {
        return forbidden(step.by === "reviewer" ? "A strategist or the owner reviews creatives." : "Only the people making this creative send it for review.");
      }
      { const blocked = await levelBlocks(store, actor, visible.clientId, "edit"); if (blocked) return blocked; }
      if (step.noteRequired && !note) {
        if (step.to === "approved") return invalid("Say who approved it, and where.", { note: ["Say who approved it, and where: e.g. Principal, on WhatsApp."] });
        return invalid("Say what should change.", { note: ["Say what should change, so the next version gets it right."] });
      }
      return commit(store, async (repos: Repositories) => {
        await repos.assets.lockForUpdate(assetId);
        const asset = await repos.assets.findById(assetId, { kind: "all" });
        if (!asset) return notFound("That creative");
        const to = nextState(asset.approvalState, action, asset.clientIsInternal);
        if (!to) return conflict(`It's "${APPROVAL_STATE_LABELS[asset.approvalState]}" now, so that step doesn't apply. Refresh to see the latest.`);
        const current = (await repos.assets.listVersions(asset.id))[0];
        if (!current) return conflict("Add a version first.");
        // The step is about the version the reviewer looked at: a newer one needs its own look.
        if (current.id !== versionId) return conflict(`Version ${current.version} was added since you opened this. Look at it, then decide.`);
        const approved = to === "approved";
        await repos.assets.update(asset.id, { approvalState: to, ...(approved ? { approvedVersionId: current.id, approvedById: actor.personId, approvedAt: deps.clock.now() } : {}) });
        await repos.assets.addComment({ id: newId(), assetId: asset.id, versionId: current.id, authorId: actor.personId, action, body: note ?? "", atSeconds: null });
        // Approved work is ready to publish on the content calendar (D81).
        const moved = approved ? await readyOnApproval(repos, { assetId: asset.id, clientId: asset.clientId, actorId: actor.personId }) : [];
        return change({ state: to }, event(actor, asset, `asset.${action}`, { version: current.version, ...(note ? { note } : {}) }), ...moved);
      });
    },

    /** A comment on one version; for video, optionally at a moment. Anyone who can see the creative can comment. */
    async comment(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      const parsed = parse(assetCommentSchema, raw);
      if (!parsed.ok) return parsed;
      const input = parsed.value;
      const asset = await store.assets.findById(input.assetId, assetScope(actor));
      if (!asset) return notFound("That creative");
      { const blocked = await levelBlocks(store, actor, asset.clientId, "comment"); if (blocked) return blocked; }
      return commit(store, async (repos) => {
        const version = (await repos.assets.listVersions(asset.id)).find((v) => v.id === input.versionId);
        if (!version) return notFound("That version");
        const id = newId();
        await repos.assets.addComment({ id, assetId: asset.id, versionId: version.id, authorId: actor.personId, action: null, body: input.body, atSeconds: input.at });
        return change({ id }, event(actor, asset, "asset.commented", { version: version.version }));
      });
    },
  };
}

/** A readable name for a link: "drive.google.com/…" style. */
function linkName(url: string): string {
  const u = new URL(url);
  const path = u.pathname.length > 1 ? u.pathname.slice(0, 40) : "";
  return `${u.hostname}${path}${u.pathname.length > 41 ? "…" : ""}`;
}

export type AssetService = ReturnType<typeof createAssetService>;
