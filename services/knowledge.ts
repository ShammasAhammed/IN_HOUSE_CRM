// Client knowledge base (Stage 11.2): tone of voice, do's and don'ts, past campaigns with what worked, brand kit files
// and SOP links, plus the client's Docs pages, in one place for the team and the AI. Everyone who can see a client
// reads it (designers need the brand kit most); strategists and the owner keep it. The AI searches it with the
// asker's own client list.
import { formatFileSize } from "@/lib/format";
import { isId, newId } from "@/lib/id";
import { conflict, forbidden, invalid, notFound, ok, type Result } from "@/lib/result";
import { parse } from "@/lib/validation/common";
import { campaignSchema, clientFileSchema, knowledgeSchema } from "@/lib/validation/knowledge";
import type { CampaignRecord, ClientFileRecord, DataStore, FileStorage, KnowledgeRecord, StoredFile } from "@/repositories";
import { change, commit, noChange } from "./change";
import type { Clock } from "./clock";
import { can, clientScope, type Actor } from "./permissions";
import { levelBlocks } from "./spaces";
import { safeFileName } from "./rules/documents";
import { matchesQuery } from "./rules/knowledge";
import { isProgramFile, MAX_TASK_FILE_BYTES, sniffTaskFileType } from "./rules/task-files";

const DENIED_WRITE = "The knowledge base is kept by strategists and the owner.";
const LINK_SECONDS = 5 * 60;

export type KnowledgeFile = Omit<ClientFileRecord, "location" | "fileId" | "provider"> & { isLink: boolean; host: string | null };
export type ClientKnowledge = {
  knowledge: Omit<KnowledgeRecord, "clientId" | "updatedAt"> & { updatedAt: Date | null };
  campaigns: CampaignRecord[];
  files: KnowledgeFile[];
  /** The client's own pages in Docs (SOPs, briefs, notes). */
  docs: Array<{ id: string; title: string }>;
  canEdit: boolean;
};
export type KnowledgeMatch = { clientId: string; clientName: string; tone: string; dos: string; donts: string; campaigns: CampaignRecord[]; files: KnowledgeFile[] };

const EMPTY: ClientKnowledge["knowledge"] = { tone: "", dos: "", donts: "", brandColours: [], version: 0, updatedByName: null, updatedAt: null };

const publicFile = ({ location, fileId: _pointer, provider, ...f }: ClientFileRecord): KnowledgeFile => ({
  ...f,
  isLink: provider === "external_link",
  host: provider === "external_link" && URL.canParse(location) ? new URL(location).hostname : null,
});

export function createKnowledgeService(deps: { store: DataStore; clock: Clock; storage: FileStorage; report?: (err: unknown, context?: Record<string, unknown>) => void }) {
  const { store, clock, storage } = deps;

  async function visibleClient(actor: Actor, clientId: string) {
    if (!isId(clientId)) return null;
    return store.clients.findById(clientId, clientScope(actor));
  }

  /** The client, when this person may keep its knowledge base; otherwise the reason. */
  async function editable(actor: Actor, clientId: string) {
    if (!can(actor, "knowledge.write")) return forbidden(DENIED_WRITE);
    const client = await visibleClient(actor, clientId);
    if (!client) return notFound("That client");
    const blocked = await levelBlocks(store, actor, client.id, "edit");
    return blocked ?? ok(client);
  }

  return {
    async forClient(actor: Actor, clientId: string): Promise<Result<ClientKnowledge>> {
      if (!(await visibleClient(actor, clientId))) return notFound("That client");
      const [kb, docs] = await Promise.all([store.knowledge.list([clientId]), store.docs.list([clientId], { clientId })]);
      const k = kb.knowledge[0];
      return ok({
        knowledge: k ? { tone: k.tone, dos: k.dos, donts: k.donts, brandColours: k.brandColours, version: k.version, updatedByName: k.updatedByName, updatedAt: k.updatedAt } : EMPTY,
        campaigns: kb.campaigns,
        files: kb.files.map(publicFile),
        docs: docs.map((d) => ({ id: d.id, title: d.title })),
        canEdit: can(actor, "knowledge.write"),
      });
    },

    /** Tone of voice and do's and don'ts. A save from a stale page is refused, so nobody's words are lost. */
    async save(actor: Actor, raw: unknown): Promise<Result<{ version: number }>> {
      const parsed = parse(knowledgeSchema, raw);
      if (!parsed.ok) return parsed;
      const { clientId, version, tone, dos, donts, brandColours } = parsed.value;
      const client = await editable(actor, clientId);
      if (!client.ok) return client;
      return commit(store, async (repos) => {
        const before = (await repos.knowledge.list([clientId])).knowledge[0];
        if (before && before.version === version && before.tone === tone && before.dos === dos && before.donts === donts && before.brandColours.join() === brandColours.join()) return noChange({ version });
        if (!(await repos.knowledge.saveKnowledge({ clientId, tone, dos, donts, brandColours, updatedById: actor.personId }, version, clock.now()))) {
          return conflict("Someone saved this in the meantime. Copy your text, reload the page and add it again.");
        }
        return change(
          { version: version + 1 },
          { actorId: actor.personId, action: "client.knowledge_saved", entityType: "client_knowledge", entityId: clientId, clientId, data: { before: before ? { tone: before.tone, dos: before.dos, donts: before.donts, brandColours: before.brandColours } : null, after: { tone, dos, donts, brandColours } } },
        );
      });
    },

    async addCampaign(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      const parsed = parse(campaignSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      const client = await editable(actor, v.clientId);
      if (!client.ok) return client;
      const id = newId();
      return commit(store, async (repos) => {
        await repos.knowledge.addCampaign({ id, ...v, createdById: actor.personId });
        return change({ id }, { actorId: actor.personId, action: "client.campaign_added", entityType: "client_campaign", entityId: id, clientId: v.clientId, data: { name: v.name, period: v.period } });
      });
    },

    async removeCampaign(actor: Actor, campaignId: string): Promise<Result<null>> {
      if (!isId(campaignId)) return notFound("That campaign");
      const c = await store.knowledge.findCampaign(campaignId);
      if (!c) return notFound("That campaign");
      const client = await editable(actor, c.clientId);
      if (!client.ok) return client;
      return commit(store, async (repos) => {
        if (!(await repos.knowledge.removeCampaign(c.id, clock.now()))) return noChange(null);
        return change(null, { actorId: actor.personId, action: "client.campaign_removed", entityType: "client_campaign", entityId: c.id, clientId: c.clientId, data: { name: c.name } });
      });
    },

    /** A brand kit file, SOP or other file (checked by its bytes, up to 3.5 MB), or a link to one kept elsewhere. */
    async addFile(actor: Actor, raw: unknown, file: { name: string; bytes: Uint8Array } | null): Promise<Result<{ id: string }>> {
      const parsed = parse(clientFileSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      const client = await editable(actor, v.clientId);
      if (!client.ok) return client;
      if (!file && !v.link) return invalid("Choose a file or paste a link.", { file: ["Choose a file or paste a link."] });
      if (file && v.link) return invalid("Add a file or a link, not both.", { link: ["Add a file or a link, not both."] });
      const id = newId();
      let stored: StoredFile | null = null;
      let row: Parameters<DataStore["knowledge"]["addFile"]>[0];
      if (file) {
        if (file.bytes.byteLength > MAX_TASK_FILE_BYTES) {
          const size = formatFileSize(file.bytes.byteLength);
          return invalid(`That file is ${size}; the limit is ${formatFileSize(MAX_TASK_FILE_BYTES)}.`, { file: [`${size} is too big. Put it in Drive and add the link instead.`] });
        }
        if (isProgramFile(file.bytes, file.name)) return invalid("Programs and scripts can't be added.", { file: ["Programs and scripts can't be added. Put it in Drive and add the link instead."] });
        const type = sniffTaskFileType(file.bytes, file.name);
        // shortcut: fonts, SVG and design files aren't taken (same list as tasks); they go in Drive as a link for now.
        if (!type) return invalid("That kind of file can't be added.", { file: ["Add a PDF, photo, Word, Excel, PowerPoint, CSV or text file. Fonts, SVG and design files: add a Drive link."] });
        const fileName = safeFileName(file.name, type);
        stored = await storage.upload({ folder: `clients/${v.clientId}/knowledge`, name: fileName, contentType: type.contentType, bytes: file.bytes });
        row = { id, clientId: v.clientId, kind: v.kind, title: v.title ?? fileName, provider: stored.provider, location: stored.location, fileId: stored.fileId, fileName, contentType: type.contentType, sizeBytes: stored.sizeBytes, addedById: actor.personId };
      } else {
        const url = new URL(v.link!);
        row = { id, clientId: v.clientId, kind: v.kind, title: v.title ?? `${url.hostname}${url.pathname.length > 1 ? url.pathname.slice(0, 40) : ""}`, provider: "external_link", location: url.toString(), fileId: url.toString(), fileName: null, contentType: null, sizeBytes: null, addedById: actor.personId };
      }
      try {
        return await commit(store, async (repos) => {
          await repos.knowledge.addFile(row);
          return change({ id }, { actorId: actor.personId, action: "client.file_added", entityType: "client_file", entityId: id, clientId: v.clientId, data: { title: row.title, kind: v.kind, link: !file } });
        });
      } catch (err) {
        // The record didn't save: don't leave the uploaded file behind with nothing pointing at it.
        if (stored) await storage.delete(stored).catch((e) => deps.report?.(e, { where: "client-files.cleanup", fileId: stored?.fileId }));
        throw err;
      }
    },

    async removeFile(actor: Actor, fileId: string): Promise<Result<null>> {
      if (!isId(fileId)) return notFound("That file");
      const f = await store.knowledge.findFile(fileId);
      if (!f) return notFound("That file");
      const client = await editable(actor, f.clientId);
      if (!client.ok) return client;
      return commit(store, async (repos) => {
        if (!(await repos.knowledge.removeFile(f.id, clock.now()))) return noChange(null);
        return change(null, { actorId: actor.personId, action: "client.file_removed", entityType: "client_file", entityId: f.id, clientId: f.clientId, data: { title: f.title } });
      });
    },

    /** Where to open a file: the link itself, or a five-minute link made for this person. */
    async fileLink(actor: Actor, fileId: string): Promise<Result<{ url: string }>> {
      if (!isId(fileId)) return notFound("That file");
      const f = await store.knowledge.findFile(fileId);
      if (!f || !(await visibleClient(actor, f.clientId))) return notFound("That file");
      if (f.provider === "external_link") return ok({ url: f.location });
      return ok({ url: await storage.getLink(f, { expiresInSeconds: LINK_SECONDS, downloadName: f.fileName ?? f.title, viewerId: actor.personId }) });
    },

    /**
     * For the assistant: every client this person can see whose knowledge matches all the words of `query` (or every
     * client with something kept, when the query is empty), with only the matching campaigns and files.
     */
    async search(actor: Actor, query: string): Promise<KnowledgeMatch[]> {
      const scope = clientScope(actor);
      if (scope.kind === "none") return [];
      const clients = await store.clients.list(scope);
      // shortcut: loads every visible client's knowledge and matches in memory; fine for tens of clients, move to a
      // database text search if it grows to hundreds.
      const kb = await store.knowledge.list(clients.map((c) => c.id));
      const out: KnowledgeMatch[] = [];
      for (const c of clients) {
        const k = kb.knowledge.find((x) => x.clientId === c.id);
        const campaigns = kb.campaigns.filter((x) => x.clientId === c.id);
        const files = kb.files.filter((x) => x.clientId === c.id);
        const nameHit = matchesQuery([c.name], query);
        const toneHit = k ? matchesQuery([c.name, k.tone, k.dos, k.donts], query) : false;
        const hitCampaigns = campaigns.filter((x) => nameHit || matchesQuery([x.name, x.period, x.whatWorked, x.whatToAvoid], query));
        const hitFiles = files.filter((x) => nameHit || matchesQuery([x.title, x.kind], query));
        if (!toneHit && !hitCampaigns.length && !hitFiles.length) continue;
        out.push({ clientId: c.id, clientName: c.name, tone: k?.tone ?? "", dos: k?.dos ?? "", donts: k?.donts ?? "", campaigns: hitCampaigns, files: hitFiles.map(publicFile) });
      }
      return out;
    },
  };
}
export type KnowledgeService = ReturnType<typeof createKnowledgeService>;
