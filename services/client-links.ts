// A client's sheets, Google files and artifacts (Stage 13.0). Google stays the editor: Oppllo One keeps the link, reads
// through the Drive service account, and never edits a Google file except the one "Oppllo data" tab write-back fills.
//   - Who: anyone who sees the client or space sees its files; people with a work role (the owner, strategists,
//     marketers) and edit level in a space add and remove them; the owner and strategists set up the Media plan
//     summary and write-back.
//   - Reading: listed tabs (or every tab when none are listed) and named ranges only, 200 rows at a time, at most 5,000
//     cells per answer, cached 15 minutes. "AI may read" off keeps a file away from the AI and the MCP.
//   - The daily job: Drive's last change → "Media plan updated by <name>" in the client's team chat, once a day per file;
//     and write-back for the sheets that asked for it.
// Adding, removing and changing a file's settings are events.
import { z } from "zod";
import { addMonths, startOfMonth } from "@/lib/dates";
import { formatRupees } from "@/lib/format";
import { isId, newId } from "@/lib/id";
import { fail, forbidden, invalid, notFound, ok, type Result } from "@/lib/result";
import { CLIENT_LINK_KINDS, CLIENT_LINK_KIND_LABELS, type ClientLinkKind } from "@/lib/types";
import { parse } from "@/lib/validation/common";
import type { ClientLinkMeta, ClientLinkRecord, DataStore, FileStorage, GoogleFiles, GoogleRead, NewEvent } from "@/repositories";
import { change, commit } from "./change";
import type { Clock } from "./clock";
import { toActor } from "./identity";
import { can, clientScope, type Actor } from "./permissions";
import { artifactFormat, asText, CACHE_MINUTES, clip, googleEditUrl, htmlText, isNamedRange, isText, kindFor, MAX_ARTIFACT_BYTES, MAX_ROWS, MAX_TEXT, parseLink, rangeTab, tabRange, WRITE_BACK_TAB } from "./rules/client-links";
import { levelBlocks } from "./spaces";

export type LinkView = Omit<ClientLinkRecord, "fileLocation" | "fileId" | "fileProvider"> & {
  kindLabel: string;
  /** Where "Open" goes: Google's editor, the link itself, or the artifact page here. */
  openUrl: string;
  /** Google's editor for a frame (Sheets, Docs, Slides), when the viewer is signed in to Google with access. */
  frameUrl: string | null;
  /** Why Oppllo One can't read it, in plain words (with the account to share it with). */
  problem: string | null;
};

const addSchema = z.object({
  clientId: z.uuid(),
  url: z.string().trim().min(8, { message: "Paste the link." }).max(2000),
  kind: z.enum(CLIENT_LINK_KINDS).optional(),
  title: z.string().trim().max(200).optional().default(""),
});
const settingsSchema = z.object({
  linkId: z.uuid(),
  aiReadable: z.boolean().optional(),
  tabs: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  summary: z.array(z.object({ label: z.string().trim().min(1).max(60), range: z.string().trim().refine(isNamedRange, { message: "Use the named range's name, like PlannedBudget." }) })).max(12).optional(),
  writeBack: z.boolean().optional(),
  title: z.string().trim().min(1).max(200).optional(),
});

export function createClientLinksService(deps: { store: DataStore; clock: Clock; storage: FileStorage; google: GoogleFiles; report?: (err: unknown, context?: Record<string, unknown>) => void }) {
  const { store, clock, storage, google } = deps;

  const visibleClient = (actor: Actor, clientId: string) => (isId(clientId) ? store.clients.findById(clientId, clientScope(actor)) : Promise.resolve(null));
  /** Add and remove: a work role, and edit level in a space (14.2). */
  async function editBlock(actor: Actor, clientId: string): Promise<string | null> {
    const client = await visibleClient(actor, clientId);
    if (!client) return "That client isn't one you can see.";
    // In a space the level decides (14.2): members at edit level or above add files; elsewhere a work role does.
    const member = client.isInternal ? (await store.clients.listMembers(client.id)).find((m) => m.personId === actor.personId) : undefined;
    const roleOk = can(actor, "projects.write") || can(actor, "knowledge.write") || can(actor, "clients.write");
    if (!roleOk && !(member && (member.level === "edit" || member.level === "manage"))) return client.isInternal ? "Only members at edit level add files to this space." : "Ask a strategist to add files for this client.";
    const blocked = await levelBlocks(store, actor, client.id, "edit");
    return blocked ? blocked.error.message : null;
  }
  const setsUp = (actor: Actor) => actor.roles.includes("owner") || actor.roles.includes("strategist");

  /** The file, if this person sees its client or space. */
  async function visible(actor: Actor, linkId: string): Promise<ClientLinkRecord | null> {
    const l = isId(linkId) ? await store.clientLinks.find(linkId) : null;
    return l && (await visibleClient(actor, l.clientId)) ? l : null;
  }

  const problemText = (m: ClientLinkMeta | null) =>
    !m?.problem ? null : m.reason === "not_shared" && google.serviceAccountEmail ? `Share this file with ${google.serviceAccountEmail} (Viewer is enough; Editor for write-back) so Oppllo One can read it.` : m.problem;

  const view = (l: ClientLinkRecord): LinkView => {
    const { fileLocation: _l, fileId: _f, fileProvider: _p, ...rest } = l;
    return {
      ...rest,
      kindLabel: CLIENT_LINK_KIND_LABELS[l.kind],
      openUrl: l.googleType && l.googleId ? googleEditUrl(l.googleType, l.googleId) : (l.url ?? `/clients/${l.clientId}/files/${l.id}`),
      frameUrl: l.googleType && l.googleId && l.googleType !== "file" ? `${googleEditUrl(l.googleType, l.googleId)}?rm=minimal` : null,
      problem: problemText(l.meta),
    };
  };

  /** What Drive says about a Google file now (title, last change, tabs), or why it can't say. */
  async function readMeta(l: Pick<ClientLinkRecord, "googleType" | "googleId">): Promise<ClientLinkMeta> {
    if (!l.googleId) return {};
    const m = await google.meta(l.googleId);
    if (!m.ok) return { problem: m.message, reason: m.reason };
    const out: ClientLinkMeta = { title: m.value.title, modifiedTime: m.value.modifiedTime?.toISOString() ?? null, modifiedBy: m.value.modifiedBy };
    if (l.googleType === "sheet") {
      const s = await google.sheet(l.googleId);
      if (s.ok) Object.assign(out, { tabs: s.value.tabs, namedRanges: s.value.namedRanges });
    }
    return out;
  }

  const event = (actor: Actor, l: Pick<ClientLinkRecord, "id" | "clientId" | "title" | "kind">, action: string, data: Record<string, unknown> = {}): NewEvent => ({ actorId: actor.personId, action, entityType: "client_link", entityId: l.id, clientId: l.clientId, data: { title: l.title, kind: l.kind, ...data } });

  /** Read through the 15-minute cache. */
  async function cached<T>(l: ClientLinkRecord, key: string, fetch: () => Promise<GoogleRead<T>>): Promise<GoogleRead<T>> {
    const now = clock.now();
    const hit = await store.clientLinks.cacheGet(l.id, key, new Date(now.getTime() - CACHE_MINUTES * 60_000));
    if (hit !== null && hit !== undefined) return { ok: true, value: hit as T };
    const r = await fetch();
    if (r.ok) await store.clientLinks.cachePut(l.id, key, r.value, now);
    return r;
  }

  async function artifactContent(l: ClientLinkRecord): Promise<string | null> {
    if (!l.fileId || !l.fileProvider) return null;
    const f = await storage.read({ provider: l.fileProvider, fileId: l.fileId });
    return f ? new TextDecoder().decode(f.bytes) : null;
  }

  /** What may be read of a file, as text: a tab (in parts), a named range, an A1 range, a doc's or artifact's text. */
  async function readText(l: ClientLinkRecord, opts: { tab?: string; range?: string; startRow?: number; part?: number }): Promise<Result<{ text: string; more: string | null }>> {
    if (l.kind === "artifact" && l.fileId) {
      const raw = await artifactContent(l);
      if (raw === null) return notFound("That page");
      const text = artifactFormat(l.fileName ?? "") === "html" ? htmlText(raw) : raw;
      return part(text, opts.part ?? 0);
    }
    if (!l.googleId || !l.googleType) return fail("invalid", "Oppllo One can't read this link: it isn't a Google file or an uploaded page. Open it to see it.");
    if (!google.connected) return fail("invalid", "Google isn't connected yet, so Oppllo One can't read this file. The link still opens it.");
    if (l.meta?.reason === "not_shared" || l.meta?.reason === "not_found") return fail("invalid", problemText(l.meta) ?? "Oppllo One can't read this file.");
    if (l.googleType !== "sheet") {
      const r = await cached(l, "text", () => google.text(l.googleId!));
      if (!r.ok) return fail("invalid", problemText({ problem: r.message, reason: r.reason }) ?? r.message);
      return part(r.value, opts.part ?? 0);
    }
    const tabs = l.tabs.length ? l.tabs : (l.meta?.tabs ?? []).map((t) => t.title);
    let range: string;
    if (opts.range) {
      if (isNamedRange(opts.range)) {
        if (l.meta?.namedRanges && !l.meta.namedRanges.includes(opts.range)) return fail("invalid", `Can't find a named range called ${opts.range} in this sheet.`);
        range = opts.range;
      } else {
        const tab = rangeTab(opts.range);
        if (!tab) return invalid("Give a tab and cells like 'Media plan'!A1:F40, or a named range.");
        if (tabs.length && !tabs.includes(tab)) return fail("invalid", `Only these tabs can be read: ${tabs.join(", ")}.`);
        range = opts.range;
      }
    } else {
      const tab = opts.tab || tabs[0];
      if (!tab) return fail("invalid", "This sheet's tabs aren't known yet. Refresh it on its client page.");
      if (tabs.length && !tabs.includes(tab)) return fail("invalid", `Only these tabs can be read: ${tabs.join(", ")}.`);
      range = tabRange(tab, opts.startRow ?? 1);
    }
    const r = await cached(l, `v:${range}`, () => google.values(l.googleId!, range));
    if (!r.ok) return fail("invalid", problemText({ problem: r.message, reason: r.reason }) ?? r.message);
    const { rows, cut } = clip(r.value);
    const start = opts.startRow ?? 1;
    const more = cut ? "The answer was cut at 5,000 cells: ask for a smaller range." : !opts.range && r.value.length >= MAX_ROWS ? `More rows follow: read again from row ${start + MAX_ROWS}.` : null;
    return ok({ text: asText(rows), more });
  }

  const part = (text: string, n: number): Result<{ text: string; more: string | null }> => {
    const chunk = text.slice(n * MAX_TEXT, (n + 1) * MAX_TEXT);
    return ok({ text: chunk, more: text.length > (n + 1) * MAX_TEXT ? `More follows: read part ${n + 1}.` : null });
  };

  return {
    googleConnected: () => google.connected,

    async page(actor: Actor, clientId: string): Promise<Result<{ links: LinkView[]; canEdit: boolean; canSetUp: boolean; google: { connected: boolean; serviceAccountEmail: string | null } }>> {
      const client = await visibleClient(actor, clientId);
      if (!client) return notFound("That client");
      const [links, block] = await Promise.all([store.clientLinks.list(client.id), editBlock(actor, client.id)]);
      return ok({ links: links.map(view), canEdit: block === null, canSetUp: block === null && setsUp(actor), google: { connected: google.connected, serviceAccountEmail: google.serviceAccountEmail } });
    },

    /** Paste a link: Google files are read for their title, last change and tabs when Oppllo One can. */
    async add(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      const parsed = parse(addSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      const client = await visibleClient(actor, v.clientId);
      if (!client) return notFound("That client");
      const block = await editBlock(actor, client.id);
      if (block) return forbidden(block);
      const p = parseLink(v.url);
      if (!p) return invalid("That doesn't look like a link.", { url: ["Paste a link starting with https://"] });
      const google_ = p.kind === "google" ? { googleType: p.googleType, googleId: p.googleId } : { googleType: null, googleId: null };
      const meta = google_.googleId && google.connected ? await readMeta(google_) : null;
      const kind: ClientLinkKind = v.kind ?? kindFor(p);
      const row = { id: newId(), clientId: client.id, kind, title: v.title || meta?.title || CLIENT_LINK_KIND_LABELS[kind], url: v.url, ...google_, fileProvider: null, fileLocation: null, fileId: null, fileName: null, fileSize: null, meta, metaAt: meta ? clock.now() : null, seenModifiedAt: meta?.modifiedTime ? new Date(meta.modifiedTime) : null, addedById: actor.personId };
      return commit(store, async (repos) => {
        await repos.clientLinks.add(row);
        return change({ id: row.id }, event(actor, row, "client_link.added"));
      });
    },

    /** Upload a Claude artifact page (.html or .md, up to 3.5 MB), kept through the storage interface. */
    async upload(actor: Actor, raw: unknown, file: { name: string; bytes: Uint8Array }): Promise<Result<{ id: string }>> {
      const parsed = parse(z.object({ clientId: z.uuid(), title: z.string().trim().max(200).optional().default("") }), raw);
      if (!parsed.ok) return parsed;
      const client = await visibleClient(actor, parsed.value.clientId);
      if (!client) return notFound("That client");
      const block = await editBlock(actor, client.id);
      if (block) return forbidden(block);
      const format = artifactFormat(file.name);
      if (!format) return invalid("Upload an artifact page: an .html or .md file.");
      if (file.bytes.byteLength > MAX_ARTIFACT_BYTES) return invalid("That page is over 3.5 MB. Link it instead.");
      if (!isText(file.bytes)) return invalid("That file isn't a text page.");
      const name = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120);
      const s = await storage.upload({ folder: `clients/${client.id}/artifacts`, name, contentType: format === "html" ? "text/html; charset=utf-8" : "text/markdown; charset=utf-8", bytes: file.bytes });
      const row = { id: newId(), clientId: client.id, kind: "artifact" as const, title: parsed.value.title || name.replace(/\.(html?|md|markdown)$/i, ""), url: null, googleType: null, googleId: null, fileProvider: s.provider, fileLocation: s.location, fileId: s.fileId, fileName: name, fileSize: s.sizeBytes, meta: null, metaAt: null, seenModifiedAt: null, addedById: actor.personId };
      return commit(store, async (repos) => {
        await repos.clientLinks.add(row);
        return change({ id: row.id }, event(actor, row, "client_link.added", { uploaded: true }));
      });
    },

    async remove(actor: Actor, linkId: string): Promise<Result<null>> {
      const l = await visible(actor, linkId);
      if (!l) return notFound("That file");
      const block = await editBlock(actor, l.clientId);
      if (block) return forbidden(block);
      return commit(store, async (repos) => {
        if (!(await repos.clientLinks.remove(l.id, clock.now()))) return notFound("That file");
        return change(null, event(actor, l, "client_link.removed"));
      });
    },

    /** "AI may read", tabs and title for editors; the Media plan summary and write-back for the owner and strategists. */
    async settings(actor: Actor, raw: unknown): Promise<Result<null>> {
      const parsed = parse(settingsSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      const l = await visible(actor, v.linkId);
      if (!l) return notFound("That file");
      const block = await editBlock(actor, l.clientId);
      if (block) return forbidden(block);
      if ((v.summary !== undefined || v.writeBack !== undefined) && !setsUp(actor)) return forbidden("The owner or a strategist sets up the summary and write-back.");
      if (v.writeBack && l.googleType !== "sheet") return invalid("Write-back is for Google Sheets.");
      const { linkId: _id, ...patch } = v;
      return commit(store, async (repos) => {
        await repos.clientLinks.update(l.id, patch);
        return change(null, event(actor, l, "client_link.changed", patch));
      });
    },

    /** Ask Drive again now (title, last change, tabs; or why it can't read it). */
    async refresh(actor: Actor, linkId: string): Promise<Result<LinkView>> {
      const l = await visible(actor, linkId);
      if (!l) return notFound("That file");
      if (!l.googleId) return ok(view(l));
      const meta = await readMeta(l);
      await store.clientLinks.update(l.id, { meta, metaAt: clock.now(), ...(l.seenModifiedAt || !meta.modifiedTime ? {} : { seenModifiedAt: new Date(meta.modifiedTime) }) });
      return ok(view({ ...l, meta, metaAt: clock.now() }));
    },

    /** Read a file (people). The AI and the MCP read through readForAi, which also checks "AI may read". */
    async read(actor: Actor, linkId: string, opts: { tab?: string; range?: string; startRow?: number; part?: number } = {}): Promise<Result<{ text: string; more: string | null }>> {
      const l = await visible(actor, linkId);
      if (!l) return notFound("That file");
      return readText(l, opts);
    },

    /** The AI's `client_files` tool: a client's files (to list), or one file's text. Same visibility, plus "AI may read". */
    async listForAi(actor: Actor, clientId: string): Promise<Result<Array<{ title: string; type: string; tabs: string[]; namedRanges: string[]; aiMayRead: boolean; lastChanged: string | null }>>> {
      const client = await visibleClient(actor, clientId);
      if (!client) return notFound("That client");
      return ok(
        (await store.clientLinks.list(client.id)).map((l) => ({
          title: l.title,
          type: CLIENT_LINK_KIND_LABELS[l.kind],
          tabs: l.tabs.length ? l.tabs : (l.meta?.tabs ?? []).map((t) => t.title),
          namedRanges: l.meta?.namedRanges ?? [],
          aiMayRead: l.aiReadable,
          lastChanged: l.meta?.modifiedTime ? `${l.meta.modifiedTime.slice(0, 10)}${l.meta.modifiedBy ? ` by ${l.meta.modifiedBy}` : ""}` : null,
        })),
      );
    },
    async readForAi(actor: Actor, clientId: string, title: string, opts: { tab?: string; range?: string; startRow?: number; part?: number }): Promise<Result<{ text: string; more: string | null }>> {
      const client = await visibleClient(actor, clientId);
      if (!client) return notFound("That client");
      const q = title.trim().toLowerCase();
      const all = await store.clientLinks.list(client.id);
      const exact = all.filter((l) => l.title.toLowerCase() === q);
      const hits = exact.length ? exact : all.filter((l) => l.title.toLowerCase().includes(q));
      if (hits.length !== 1) return fail("invalid", hits.length ? `"${title}" matches ${hits.map((h) => h.title).join(", ")}. Which one?` : `No file called "${title}" for ${client.name}.`);
      if (!hits[0]!.aiReadable) return forbidden("The team keeps this file away from the AI (it may hold personal data).");
      return readText(hits[0]!, opts);
    },

    /** The Media plan summary: each mapped named range's value, or a clear "can't find" instead of a wrong number. */
    async summary(actor: Actor, linkId: string): Promise<Result<Array<{ label: string; value: string | null; problem: string | null }>>> {
      const l = await visible(actor, linkId);
      if (!l) return notFound("That file");
      if (!l.googleId || l.googleType !== "sheet") return ok([]);
      const out: Array<{ label: string; value: string | null; problem: string | null }> = [];
      for (const s of l.summary) {
        if (l.meta?.namedRanges && !l.meta.namedRanges.includes(s.range)) {
          out.push({ label: s.label, value: null, problem: `Can't find ${s.range} in the sheet` });
          continue;
        }
        const r = await cached(l, `v:${s.range}`, () => google.values(l.googleId!, s.range));
        const value = r.ok ? (r.value[0]?.[0] ?? "") : null;
        out.push({ label: s.label, value: r.ok && value !== "" ? value : null, problem: r.ok ? (value === "" ? `${s.range} is empty` : null) : (problemText({ problem: r.message, reason: r.reason }) ?? r.message) });
      }
      return ok(out);
    },

    /** For the monthly report draft (11.4): Media plan summaries as plain lines (files the AI may read only). */
    async summariesForReport(actor: Actor, clientId: string): Promise<string[]> {
      const client = await visibleClient(actor, clientId);
      if (!client) return [];
      const lines: string[] = [];
      for (const l of (await store.clientLinks.list(client.id)).filter((x) => x.kind === "media_plan" && x.aiReadable && x.summary.length)) {
        const s = await this.summary(actor, l.id);
        if (s.ok) lines.push(`${l.title}: ${s.value.map((x) => `${x.label} ${x.value ?? "unknown"}`).join("; ")}`);
      }
      return lines;
    },

    /** An uploaded artifact page, for the sandboxed view. */
    async artifact(actor: Actor, linkId: string): Promise<Result<{ format: "html" | "md"; content: string; title: string }>> {
      const l = await visible(actor, linkId);
      const format = l?.fileName ? artifactFormat(l.fileName) : null;
      if (!l || !format) return notFound("That page");
      const content = await artifactContent(l);
      return content === null ? notFound("That page") : ok({ format, content, title: l.title });
    },

    /**
     * Daily: each Google file's last change → "updated by <name>" in the client's team chat, once a day per file; and
     * write-back (11.1's monthly numbers into the "Oppllo data" tab, never another tab) where it's on.
     */
    async runDaily(): Promise<{ noticed: number; written: number; errors: unknown[] }> {
      const out = { noticed: 0, written: 0, errors: [] as unknown[] };
      if (!google.connected) return out;
      const ownerRecord = (await store.people.listActive()).find((p) => p.roles.includes("owner"));
      if (!ownerRecord) return out;
      const system = toActor(ownerRecord);
      const today = clock.today();
      for (const l of await store.clientLinks.allGoogle()) {
        try {
          const meta = await readMeta(l);
          const changed = meta.modifiedTime ? new Date(meta.modifiedTime) : null;
          const news = changed && l.seenModifiedAt && changed > l.seenModifiedAt && l.noticedOn !== today;
          await store.clientLinks.update(l.id, { meta, metaAt: clock.now(), ...(changed && (!l.seenModifiedAt || news) ? { seenModifiedAt: changed } : {}), ...(news ? { noticedOn: today } : {}) });
          if (news) {
            const channelId = (await store.chat.clientChannel(l.clientId)) ?? (await (async () => {
              const id = newId();
              await store.chat.createChannel({ id, kind: "client", clientId: l.clientId, name: null, createdById: system.personId });
              return (await store.chat.clientChannel(l.clientId)) ?? id;
            })());
            await commit(store, async (repos) => {
              await repos.chat.addMessage({ id: newId(), channelId, authorId: system.personId, body: `📄 ${CLIENT_LINK_KIND_LABELS[l.kind]} “${l.title}” was updated in Google by ${meta.modifiedBy ?? "someone"}.`, mentions: [], file: null }, clock.now());
              return change(null, event(system, l, "client_link.change_noticed", { by: meta.modifiedBy ?? null }));
            });
            out.noticed++;
          }
          if (l.writeBack && l.googleType === "sheet") {
            const month = startOfMonth(today);
            const rows = await store.results.list({ clientIds: [l.clientId], from: addMonths(month, -11), to: month });
            const money = (p: number | null) => (p === null ? "" : formatRupees(p));
            const table: Array<Array<string | number>> = [
              ["Month", "Leads", "Ad spend", "Cost per lead", "Calls booked", "Admissions", "Written by Oppllo One on", today],
              ...rows.map((r) => [r.month.slice(0, 7), r.leads ?? "", money(r.spendPaise), r.leads && r.spendPaise ? money(Math.round(r.spendPaise / r.leads)) : "", r.callsBooked ?? "", r.admissions ?? ""]),
            ];
            const w = await google.writeTab(l.googleId!, WRITE_BACK_TAB, table);
            if (w.ok) out.written++;
            else out.errors.push(new Error(`Write-back to ${l.title}: ${w.message}`));
          }
        } catch (err) {
          out.errors.push(err);
          deps.report?.(err, { linkId: l.id });
        }
      }
      return out;
    },
  };
}
export type ClientLinksService = ReturnType<typeof createClientLinksService>;
