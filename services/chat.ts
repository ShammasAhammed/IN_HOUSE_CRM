// Chat (Stage 12.1): the team talks where the work is, instead of client and team WhatsApp groups.
// Who sees a channel follows existing permissions exactly:
//   - a client channel (one per client or space) is seen by the people who see that client (clientScope), so a private
//     space's channel only by its live members and the owner; posting in a space needs "comment" or above (14.2);
//   - team channels and direct messages are seen by their members (owner and strategists start team channels);
//   - a task's chat is its comments (task pages), listed here and never stored twice.
// Every message write and every channel or membership change is an event (the owner's audit log).
// Mentions notify only people who may see the channel; direct messages notify the others once a day per chat; both
// reach the daily email digest through notifications. A client in the portal has no Actor and reaches none of this.
import { z } from "zod";
import { istDate } from "@/lib/dates";
import { formatFileSize } from "@/lib/format";
import { isId, newId } from "@/lib/id";
import { conflict, forbidden, invalid, notFound, ok, type Result } from "@/lib/result";
import { parse } from "@/lib/validation/common";
import type { ChannelRecord, ChatFile, DataStore, FileStorage, MessageRecord, NewEvent, NotificationWrite, PersonRecord } from "@/repositories";
import { change, commit, noChange } from "./change";
import type { Clock } from "./clock";
import { toActor } from "./identity";
import { clientScope, type Actor } from "./permissions";
import { channelTitle, MAX_BODY, MAX_DIRECT_PEOPLE, mayEdit, PAGE_SIZE } from "./rules/chat";
import { safeFileName } from "./rules/documents";
import { findMentions } from "./rules/mentions";
import { isProgramFile, MAX_TASK_FILE_BYTES, sniffTaskFileType } from "./rules/task-files";
import { levelBlocks } from "./spaces";

/** A client's own staff channel, or the chat shared with the client (12.6): both follow who sees the client. */
export const forClient = (kind: string) => kind === "client" || kind === "shared";

const LINK_SECONDS = 60 * 60;
const body = z.string().trim().max(MAX_BODY, { message: `Keep it under ${MAX_BODY.toLocaleString("en-IN")} characters.` });
const sendSchema = z.object({ channelId: z.uuid(), body: body.optional().default("") });
const editSchema = z.object({ messageId: z.uuid(), body: body.min(1, { message: "Write something, or remove the message." }) });
const teamSchema = z.object({
  name: z.string().trim().min(2, { message: "Name the channel." }).max(60, { message: "Keep the name under 60 characters." }),
  memberIds: z.array(z.uuid()).max(100).optional().default([]),
});
const peopleSchema = z.object({ personIds: z.array(z.uuid()).min(1, { message: "Pick at least one person." }).max(MAX_DIRECT_PEOPLE - 1, { message: `Up to ${MAX_DIRECT_PEOPLE} people in a direct message.` }) });

export type ChannelView = ChannelRecord & { title: string };
export type MessageView = Omit<MessageRecord, "file"> & { file: { name: string; size: string | null; isLink: boolean } | null; canEdit: boolean; canRemove: boolean; mine: boolean };
export type ChatList = {
  channels: ChannelView[];
  taskChats: Array<{ id: string; title: string; clientName: string; comments: number }>;
  canCreateTeam: boolean;
  people: Array<{ id: string; name: string }>;
  /** Shared chats whose client wrote last (12.6), oldest wait first. */
  waiting: Array<{ channelId: string; clientName: string; since: Date }>;
};
export type Conversation = {
  channel: ChannelView;
  messages: MessageView[];
  hasEarlier: boolean;
  members: Array<{ personId: string; fullName: string }>;
  mentionable: Array<{ id: string; name: string }>;
  canPost: boolean;
  /** Why not, when not (archived, view-only access). */
  readOnlyReason: string | null;
  canManage: boolean;
  serverTime: string;
  /** When this person last read it before this visit ("catch me up" starts there). */
  lastReadAt: string | null;
};

/** A file for a chat, with the task-file checks and size limit (12.1; the client's chat too, 12.6). */
export async function storeChatFile(storage: FileStorage, channelId: string, file: { name: string; bytes: Uint8Array }): Promise<Result<ChatFile>> {
  if (file.bytes.byteLength > MAX_TASK_FILE_BYTES) return invalid(`That file is ${formatFileSize(file.bytes.byteLength)}; the limit is ${formatFileSize(MAX_TASK_FILE_BYTES)}. Share a Drive link instead.`);
  const type = isProgramFile(file.bytes, file.name) ? null : sniffTaskFileType(file.bytes, file.name);
  if (!type) return invalid("That kind of file can't be shared here: PDF, photo, Word, Excel, PowerPoint, CSV or text. Share a Drive link instead.");
  const name = safeFileName(file.name, type);
  const s = await storage.upload({ folder: `chat/${channelId}`, name, contentType: type.contentType, bytes: file.bytes });
  return ok({ provider: s.provider, location: s.location, fileId: s.fileId, name, type: type.contentType, size: s.sizeBytes });
}

export function createChatService(deps: { store: DataStore; clock: Clock; storage: FileStorage; report?: (err: unknown, context?: Record<string, unknown>) => void }) {
  const { store, clock, storage } = deps;
  const startsTeams = (actor: Actor) => actor.roles.includes("owner") || actor.roles.includes("strategist");

  async function visibleClientIds(actor: Actor): Promise<string[]> {
    const scope = clientScope(actor);
    return scope.kind === "none" ? [] : store.clients.visibleIds(scope);
  }

  /** The channel, if this person may see it. */
  async function visible(actor: Actor, channelId: string): Promise<ChannelRecord | null> {
    if (!isId(channelId)) return null;
    const c = await store.chat.find(channelId);
    if (!c) return null;
    if (forClient(c.kind)) return c.clientId && (await store.clients.findById(c.clientId, clientScope(actor))) ? c : null;
    return (await store.chat.members(c.id)).some((m) => m.personId === actor.personId) ? c : null;
  }

  /** May this person write here? Null when yes, otherwise why not. */
  async function postBlock(actor: Actor, c: ChannelRecord): Promise<string | null> {
    if (c.archivedAt) return "This channel is archived.";
    // The chat the client sees (12.6): the client's team writes there, everyone else who sees the client reads.
    if (c.kind === "shared" && c.clientId && !(await onClientTeam(actor, c.clientId))) return "Only the client's team writes in the chat the client sees. You can read it.";
    if (forClient(c.kind) && c.clientId) {
      const blocked = await levelBlocks(store, actor, c.clientId, "comment");
      if (blocked) return blocked.error.message;
    }
    return null;
  }

  /** The owner, the lead strategist, or a member of the client's team with comment level or above. */
  async function onClientTeam(actor: Actor, clientId: string): Promise<boolean> {
    if (actor.roles.includes("owner")) return true;
    const [client, members] = await Promise.all([store.clients.findById(clientId, clientScope(actor)), store.clients.listMembers(clientId)]);
    if (!client) return false;
    if (client.leadStrategist?.id === actor.personId) return true;
    return members.some((m) => m.personId === actor.personId && m.level !== "view" && (!m.expiresOn || m.expiresOn >= clock.today()));
  }

  /** Could this person see the channel? For whom a mention may notify. */
  async function personSees(person: PersonRecord, c: ChannelRecord, memberIds: ReadonlySet<string>): Promise<boolean> {
    if (person.status !== "active" || !person.roles.length) return false;
    if (!forClient(c.kind)) return memberIds.has(person.id);
    const a = toActor(person);
    return Boolean(c.clientId && (await store.clients.findById(c.clientId, clientScope(a))));
  }

  const viewOf = (actor: Actor, now: Date) => (m: MessageRecord): MessageView => ({
    ...m,
    file: m.file ? { name: m.file.name, size: m.file.size ? formatFileSize(m.file.size) : null, isLink: m.file.provider === "external_link" } : null,
    canEdit: mayEdit(m, actor.personId, now),
    canRemove: m.authorId === actor.personId && !m.deletedAt,
    mine: m.authorId === actor.personId,
  });
  const titled = (actor: Actor) => (c: ChannelRecord): ChannelView => ({ ...c, title: channelTitle(c, actor.fullName) });
  const channelEvent = (actor: Actor, c: Pick<ChannelRecord, "id" | "kind" | "clientId">, action: string, data: Record<string, unknown>): NewEvent => ({
    actorId: actor.personId,
    action,
    entityType: "chat_channel",
    entityId: c.id,
    // Client channels show in the client's history; private ones follow the client's own visibility.
    clientId: forClient(c.kind) ? c.clientId : null,
    data,
  });
  // Every message write is an event, for the owner's audit log; no client id, so client histories stay about the work.
  const messageEvent = (actor: Actor, channelId: string, action: string, data: Record<string, unknown>): NewEvent => ({ actorId: actor.personId, action, entityType: "chat_channel", entityId: channelId, clientId: null, data });
  /** A team channel's starter or the owner renames, archives and changes its people. */
  const manages = (actor: Actor, c: ChannelRecord) => c.kind === "team" && (actor.roles.includes("owner") || c.createdById === actor.personId);

  return {
    async list(actor: Actor): Promise<ChatList> {
      const [ids, tasks, people] = await Promise.all([
        visibleClientIds(actor),
        store.tasks.list({ scope: { kind: "own", personId: actor.personId }, assignedTo: actor.personId, statuses: ["todo", "in_progress", "in_review", "blocked"], anyLevel: true, limit: 200 }),
        store.people.listActive(),
      ]);
      const channels = await store.chat.channels(actor.personId, ids);
      const waiting = await store.chat.waiting(channels.filter((c) => c.kind === "shared" && !c.archivedAt).map((c) => c.id));
      return {
        waiting: waiting.map((w) => ({ channelId: w.channelId, clientName: w.clientName, since: w.since })),
        channels: channels.map(titled(actor)),
        // A task's chat is its comments: the tasks this person works on that have a conversation.
        taskChats: tasks.filter((t) => t.commentCount > 0).slice(0, 20).map((t) => ({ id: t.id, title: t.title, clientName: t.clientName, comments: t.commentCount })),
        canCreateTeam: startsTeams(actor),
        people: people.filter((p) => p.id !== actor.personId).map((p) => ({ id: p.id, name: p.fullName })),
      };
    },

    /** Every unread message this person has across their channels (the menu's number). */
    async unreadTotal(actor: Actor): Promise<number> {
      const channels = await store.chat.channels(actor.personId, await visibleClientIds(actor));
      return channels.filter((c) => !c.archivedAt).reduce((n, c) => n + c.unread, 0);
    },

    /** The chat shared with the client (12.6), made the first time someone opens it. Never for Oppllo's own spaces. */
    async openShared(actor: Actor, clientId: string): Promise<Result<{ id: string }>> {
      const client = isId(clientId) ? await store.clients.findById(clientId, clientScope(actor)) : null;
      if (!client) return notFound("That client");
      if (client.isInternal) return invalid("Oppllo's own spaces have no client chat.");
      const existing = await store.chat.clientChannel(client.id, "shared");
      if (existing) return ok({ id: existing });
      const id = newId();
      const r = await commit(store, async (repos) => {
        if (!(await repos.chat.createChannel({ id, kind: "shared", clientId: client.id, name: null, createdById: actor.personId }))) return noChange(null);
        return change(null, channelEvent(actor, { id, kind: "shared", clientId: client.id }, "chat.channel_created", { kind: "shared", name: client.name }));
      });
      if (!r.ok) return r;
      return ok({ id: (await store.chat.clientChannel(client.id, "shared")) ?? id });
    },

    /** For the client page's move-over checklist (12.6): when the client first wrote, if they have. */
    async firstClientMessage(actor: Actor, clientId: string): Promise<Date | null> {
      return isId(clientId) && (await store.clients.findById(clientId, clientScope(actor))) ? store.chat.firstClientMessage(clientId) : null;
    },

    /** Other clients' names this person sees, for the "Send to the client?" check in a shared chat (12.6). */
    async otherClientNames(actor: Actor, clientId: string): Promise<string[]> {
      const scope = clientScope(actor);
      return scope.kind === "none" ? [] : (await store.clients.list(scope)).filter((c) => c.id !== clientId).map((c) => c.name);
    },

    /** The client's or space's channel, made the first time someone opens it. */
    async openClient(actor: Actor, clientId: string): Promise<Result<{ id: string }>> {
      const client = isId(clientId) ? await store.clients.findById(clientId, clientScope(actor)) : null;
      if (!client) return notFound("That client");
      const existing = await store.chat.clientChannel(client.id);
      if (existing) return ok({ id: existing });
      const id = newId();
      const r = await commit(store, async (repos) => {
        if (!(await repos.chat.createChannel({ id, kind: "client", clientId: client.id, name: null, createdById: actor.personId }))) return noChange(null);
        return change(null, channelEvent(actor, { id, kind: "client", clientId: client.id }, "chat.channel_created", { kind: "client", name: client.name }));
      });
      if (!r.ok) return r;
      return ok({ id: (await store.chat.clientChannel(client.id)) ?? id });
    },

    async conversation(actor: Actor, channelId: string): Promise<Result<Conversation>> {
      const c = await visible(actor, channelId);
      if (!c) return notFound("That chat");
      const now = clock.now();
      const [rows, members, block, people, lastRead] = await Promise.all([store.chat.messages(c.id, { limit: PAGE_SIZE + 1 }), forClient(c.kind) ? Promise.resolve([]) : store.chat.members(c.id), postBlock(actor, c), store.people.listActive(), store.chat.lastRead(c.id, actor.personId)]);
      await store.chat.markRead(c.id, actor.personId, now);
      const page = rows.slice(0, PAGE_SIZE).reverse();
      return ok({
        channel: titled(actor)(c),
        messages: page.map(viewOf(actor, now)),
        hasEarlier: rows.length > PAGE_SIZE,
        members,
        // Suggestions after "@": the channel's members, or the team for a client channel (only those who see it are told).
        mentionable: (forClient(c.kind) ? people.map((p) => ({ id: p.id, name: p.fullName })) : members.map((m) => ({ id: m.personId, name: m.fullName }))).filter((p) => p.id !== actor.personId),
        canPost: block === null,
        readOnlyReason: block,
        canManage: manages(actor, c),
        serverTime: now.toISOString(),
        lastReadAt: lastRead?.toISOString() ?? null,
      });
    },

    /** "Load earlier": the 50 before the oldest one shown. */
    async earlier(actor: Actor, channelId: string, before: { createdAt: string; id: string }): Promise<Result<{ messages: MessageView[]; hasEarlier: boolean }>> {
      const c = await visible(actor, channelId);
      const at = new Date(before.createdAt);
      if (!c || !isId(before.id) || Number.isNaN(at.getTime())) return notFound("That chat");
      const rows = await store.chat.messages(c.id, { before: { createdAt: at, id: before.id }, limit: PAGE_SIZE + 1 });
      return ok({ messages: rows.slice(0, PAGE_SIZE).reverse().map(viewOf(actor, clock.now())), hasEarlier: rows.length > PAGE_SIZE });
    },

    /**
     * The open conversation's regular check: what changed since `since` (new, edited, removed), and it's read now.
     * D-12.1a shortcut: checking every few seconds while the tab is visible; move to a live-message service (Supabase
     * Realtime, Pusher or Ably) behind a port when the team feels a delay or the checks cost too much.
     */
    async changes(actor: Actor, channelId: string, sinceRaw: string): Promise<Result<{ messages: MessageView[]; serverTime: string }>> {
      const c = await visible(actor, channelId);
      const since = new Date(sinceRaw);
      if (!c || Number.isNaN(since.getTime())) return notFound("That chat");
      const now = clock.now();
      const rows = await store.chat.changes(c.id, since, 200);
      if (rows.length) await store.chat.markRead(c.id, actor.personId, now);
      return ok({ messages: rows.map(viewOf(actor, now)), serverTime: now.toISOString() });
    },

    async send(actor: Actor, raw: unknown, file: { name: string; bytes: Uint8Array } | null): Promise<Result<MessageView>> {
      const parsed = parse(sendSchema, raw);
      if (!parsed.ok) return parsed;
      const { channelId, body: text } = parsed.value;
      if (!text && !file) return invalid("Write a message or attach a file.", { body: ["Write a message first."] });
      const c = await visible(actor, channelId);
      if (!c) return notFound("That chat");
      const block = await postBlock(actor, c);
      if (block) return forbidden(block);
      let stored: ChatFile | null = null;
      if (file) {
        const f = await storeChatFile(storage, c.id, file);
        if (!f.ok) return f;
        stored = f.value;
      }
      const now = clock.now();
      const [people, members] = await Promise.all([store.people.listActive(), forClient(c.kind) ? Promise.resolve([]) : store.chat.members(c.id)]);
      const memberIds = new Set(members.map((m) => m.personId));
      const mentioned: string[] = [];
      for (const id of findMentions(text, people).filter((p) => p !== actor.personId)) {
        const person = people.find((p) => p.id === id);
        if (person && (await personSees(person, c, memberIds))) mentioned.push(id);
      }
      const id = newId();
      const title = channelTitle(c, actor.fullName);
      const notes: Array<NotificationWrite & { id: string }> = mentioned.map((personId) => ({ id: newId(), personId, kind: "chat.mention", title: `${actor.fullName} mentioned you in ${c.kind === "direct" ? "a direct message" : title}`, body: text.slice(0, 200), link: `/chat/${c.id}`, entityType: "chat_channel", entityId: c.id, dedupeKey: `chat-mention:${id}` }));
      // Direct messages tell the others once a day per chat; the unread count shows the rest.
      if (c.kind === "direct") for (const m of members) if (m.personId !== actor.personId && !mentioned.includes(m.personId)) notes.push({ id: newId(), personId: m.personId, kind: "chat.direct", title: `New message from ${actor.fullName}`, body: text.slice(0, 200), link: `/chat/${c.id}`, entityType: "chat_channel", entityId: c.id, dedupeKey: `chat-direct:${c.id}:${istDate(now)}` });
      const r = await commit(store, async (repos) => {
        await repos.chat.addMessage({ id, channelId: c.id, authorId: actor.personId, body: text, mentions: mentioned, file: stored }, now);
        await repos.chat.markRead(c.id, actor.personId, now);
        if (notes.length) await repos.notifications.create(notes);
        return change(null, messageEvent(actor, c.id, "chat.message_sent", { messageId: id, file: stored?.name ?? null }));
      });
      if (!r.ok) return r;
      const saved = await store.chat.findMessage(id);
      return saved ? ok(viewOf(actor, now)(saved)) : notFound("That message");
    },

    async edit(actor: Actor, raw: unknown): Promise<Result<MessageView>> {
      const parsed = parse(editSchema, raw);
      if (!parsed.ok) return parsed;
      const m = await store.chat.findMessage(parsed.value.messageId);
      if (!m || !(await visible(actor, m.channelId))) return notFound("That message");
      const now = clock.now();
      if (!mayEdit(m, actor.personId, now)) return forbidden(m.aiReplyTo ? "AI answers can't be changed; remove it instead." : m.authorId === actor.personId ? "Messages can be changed for 15 minutes. Remove it and write it again instead." : "Only who wrote a message changes it.");
      const r = await commit(store, async (repos) => {
        await repos.chat.updateMessage(m.id, { body: parsed.value.body, editedAt: now }, now);
        return change(null, messageEvent(actor, m.channelId, "chat.message_edited", { messageId: m.id, before: m.body }));
      });
      if (!r.ok) return r;
      return ok(viewOf(actor, now)((await store.chat.findMessage(m.id))!));
    },

    /** Removing your own message leaves "message removed" in its place; nothing is hard-deleted. */
    async remove(actor: Actor, messageId: string): Promise<Result<null>> {
      const m = isId(messageId) ? await store.chat.findMessage(messageId) : null;
      if (!m || !(await visible(actor, m.channelId))) return notFound("That message");
      if (m.authorId !== actor.personId) return forbidden("Only who wrote a message removes it.");
      if (m.deletedAt) return ok(null);
      const now = clock.now();
      return commit(store, async (repos) => {
        await repos.chat.updateMessage(m.id, { deletedAt: now }, now);
        return change(null, messageEvent(actor, m.channelId, "chat.message_removed", { messageId: m.id }));
      });
    },

    /** A short-lived link to an attachment, for people who see the chat. */
    async fileLink(actor: Actor, messageId: string): Promise<Result<{ url: string }>> {
      const m = isId(messageId) ? await store.chat.findMessage(messageId) : null;
      if (!m?.file || !(await visible(actor, m.channelId))) return notFound("That file");
      if (m.file.provider === "external_link") return ok({ url: m.file.location });
      return ok({ url: await storage.getLink(m.file, { expiresInSeconds: LINK_SECONDS, downloadName: m.file.name, viewerId: actor.personId }) });
    },

    // ---------- team channels and direct messages ----------

    async createTeam(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!startsTeams(actor)) return forbidden("The owner and strategists start team channels.");
      const parsed = parse(teamSchema, raw);
      if (!parsed.ok) return parsed;
      const { name, memberIds } = parsed.value;
      const active = new Set((await store.people.listActive()).map((p) => p.id));
      const ids = [...new Set([actor.personId, ...memberIds])].filter((p) => active.has(p));
      const id = newId();
      return commit(store, async (repos) => {
        await repos.chat.createChannel({ id, kind: "team", clientId: null, name, createdById: actor.personId });
        for (const p of ids) await repos.chat.addMember(id, p, actor.personId);
        return change({ id }, channelEvent(actor, { id, kind: "team", clientId: null }, "chat.channel_created", { kind: "team", name, members: ids.length }));
      });
    },

    /** Start (or reopen) a direct message with these people. */
    async direct(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      const parsed = parse(peopleSchema, raw);
      if (!parsed.ok) return parsed;
      const active = new Set((await store.people.listActive()).map((p) => p.id));
      const ids = [...new Set([actor.personId, ...parsed.value.personIds])].filter((p) => active.has(p));
      if (ids.length < 2) return invalid("Pick someone on the team.");
      const existing = await store.chat.directWith(ids);
      if (existing) return ok({ id: existing });
      const id = newId();
      return commit(store, async (repos) => {
        await repos.chat.createChannel({ id, kind: "direct", clientId: null, name: null, createdById: actor.personId });
        for (const p of ids) await repos.chat.addMember(id, p, actor.personId);
        return change({ id }, channelEvent(actor, { id, kind: "direct", clientId: null }, "chat.channel_created", { kind: "direct", members: ids.length }));
      });
    },

    /** Rename, archive, add or remove people: a team channel's starter or the owner. */
    async manage(actor: Actor, raw: unknown): Promise<Result<null>> {
      const parsed = parse(
        z.object({ channelId: z.uuid(), action: z.enum(["rename", "archive", "unarchive", "add", "remove"]), name: z.string().trim().min(2).max(60).optional(), personId: z.uuid().optional() }),
        raw,
      );
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      const c = await visible(actor, v.channelId);
      if (!c || !manages(actor, c)) return forbidden("The channel's starter or the owner changes it.");
      return commit(store, async (repos) => {
        const now = clock.now();
        if (v.action === "rename") {
          if (!v.name) return invalid("Name the channel.");
          await repos.chat.updateChannel(c.id, { name: v.name });
          return change(null, channelEvent(actor, c, "chat.channel_renamed", { from: c.name, to: v.name }));
        }
        if (v.action === "archive" || v.action === "unarchive") {
          await repos.chat.updateChannel(c.id, { archivedAt: v.action === "archive" ? now : null });
          return change(null, channelEvent(actor, c, `chat.channel_${v.action}d`, { name: c.name }));
        }
        if (!v.personId) return invalid("Pick a person.");
        const person = await repos.people.findById(v.personId);
        if (v.action === "add") {
          if (!person || person.status !== "active") return invalid("Pick someone on the team.");
          await repos.chat.addMember(c.id, person.id, actor.personId);
          return change(null, { ...channelEvent(actor, c, "chat.member_added", { name: person.fullName, channel: c.name }), personId: person.id });
        }
        if (!(await repos.chat.removeMember(c.id, v.personId, now))) return conflict("They weren't in this channel.");
        return change(null, { ...channelEvent(actor, c, "chat.member_removed", { name: person?.fullName ?? "someone", channel: c.name }), personId: v.personId });
      });
    },

    /** The channel if this person may see it (the co-worker's cards follow the chat they're in, 12.5). */
    canSee: (actor: Actor, channelId: string) => visible(actor, channelId),

    // ---------- for AI in chat (Stage 12.2) ----------

    /**
     * A chat as the AI sees it for this person: the channel, whether they may post, its recent messages, and everyone
     * who can read it right now (each as their own Actor), so an answer posted there stays inside what they all see.
     */
    async forAi(actor: Actor, channelId: string, limit: number): Promise<Result<{ channel: ChannelView; postBlock: string | null; messages: MessageRecord[]; readers: Actor[] }>> {
      const c = await visible(actor, channelId);
      if (!c) return notFound("That chat");
      const [people, members, block, rows] = await Promise.all([store.people.listActive(), forClient(c.kind) ? Promise.resolve([]) : store.chat.members(c.id), postBlock(actor, c), store.chat.messages(c.id, { limit })]);
      const memberIds = new Set(members.map((m) => m.personId));
      const readers: Actor[] = [];
      for (const p of people) if (await personSees(p, c, memberIds)) readers.push(toActor(p));
      if (!readers.some((r) => r.personId === actor.personId)) readers.push(actor);
      return ok({ channel: titled(actor)(c), postBlock: block, messages: rows.reverse(), readers });
    },

    /** Post an AI answer to someone's @AI question: labelled AI, authored by who asked, once per question. */
    async postAiAnswer(actor: Actor, questionId: string, text: string): Promise<Result<MessageView>> {
      const q = isId(questionId) ? await store.chat.findMessage(questionId) : null;
      if (!q || q.authorId !== actor.personId || q.deletedAt || q.aiReplyTo) return notFound("That question");
      const c = await visible(actor, q.channelId);
      if (!c) return notFound("That chat");
      const block = await postBlock(actor, c);
      if (block) return forbidden(block);
      const id = newId();
      const now = clock.now();
      const r = await commit(store, async (repos) => {
        if (!(await repos.chat.addMessage({ id, channelId: c.id, authorId: actor.personId, body: text.slice(0, MAX_BODY), mentions: [], file: null, aiReplyTo: q.id }, now))) return conflict("The AI already answered that question.");
        return change(null, messageEvent(actor, c.id, "chat.message_sent", { messageId: id, ai: true, question: q.id }));
      });
      if (!r.ok) return r;
      const saved = await store.chat.findMessage(id);
      return saved ? ok(viewOf(actor, now)(saved)) : notFound("That message");
    },

    /** Global search: messages in chats this person may see. */
    async search(actor: Actor, query: string): Promise<Array<MessageRecord & { channelName: string }>> {
      const channels = await store.chat.channels(actor.personId, await visibleClientIds(actor));
      return store.chat.search(channels.map((c) => c.id), query, 8);
    },
  };
}
export type ChatService = ReturnType<typeof createChatService>;
