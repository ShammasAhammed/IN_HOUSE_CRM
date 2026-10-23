// Client chat (Stage 12.6): the chat a client shares with Oppllo, seen from the portal. Clients off WhatsApp.
//   - One shared chat per client ("<client> – with client"), separate from the staff-only client channel (12.1), made
//     on first use; Oppllo's own spaces never get one. Staff use it from Chat (chat.ts, with its own posting rule).
//   - A portal user reads and writes as themselves (the author is the portal user, like 11.6 comments); the session is
//     re-checked on every request, so revoking them or removing the contact closes the chat at once.
//   - What the client sees of a message: their own portal links work, other Oppllo One links show as "internal link"
//     (rules/client-chat.ts); staff-only messages never exist here (the staff channel is another channel).
//   - Alerts: staff get a notification (once an hour per chat) when the client writes; a client gets an email "You have
//     a new message from Oppllo" at most once an hour, only while they haven't read it, and only when email is set up.
// Every message written, changed or removed is an event (no client id, like 12.1).
import { z } from "zod";
import { formatFileSize } from "@/lib/format";
import { isId, newId } from "@/lib/id";
import { forbidden, invalid, notFound, ok, type Result } from "@/lib/result";
import { parse } from "@/lib/validation/common";
import type { ChatFile, DataStore, FileStorage, Mailer, MessageRecord, NewEvent, NotificationWrite } from "@/repositories";
import { change, commit } from "./change";
import { storeChatFile } from "./chat";
import type { Clock } from "./clock";
import type { PortalService, PortalSession } from "./portal";
import { EDIT_MINUTES, MAX_BODY, PAGE_SIZE } from "./rules/chat";
import { portalParts, type PortalAllowed, type PortalPart } from "./rules/client-chat";

/** At most one email (to a client) or notification (to staff) per chat per this many minutes. */
export const ALERT_GAP_MINUTES = 60;
const LINK_SECONDS = 60 * 60;

export type PortalMessage = {
  id: string;
  mine: boolean;
  fromStaff: boolean;
  authorName: string;
  parts: PortalPart[];
  /** Their own words, for editing (their messages only). */
  body: string | null;
  file: { name: string; size: string | null } | null;
  createdAt: Date;
  updatedAt: Date;
  edited: boolean;
  removed: boolean;
  canEdit: boolean;
  canRemove: boolean;
};
export type PortalChat = {
  messages: PortalMessage[];
  hasEarlier: boolean;
  serverTime: string;
  /** What waits for them elsewhere in the portal. */
  cards: { creatives: number; latestReport: string | null; openRequests: number };
};

const body = z.string().trim().max(MAX_BODY, { message: `Keep it under ${MAX_BODY.toLocaleString("en-IN")} characters.` });

export function createClientChatService(deps: {
  store: DataStore;
  clock: Clock;
  storage: FileStorage;
  mailer: Mailer;
  emailReady: boolean;
  appUrl: string;
  portal: Pick<PortalService, "creatives" | "reports">;
}) {
  const { store, clock, storage } = deps;
  const appOrigin = new URL(deps.appUrl).origin;

  /** The client's shared chat, made the first time either side opens it. */
  async function channelOf(ps: PortalSession): Promise<string> {
    const existing = await store.chat.clientChannel(ps.clientId, "shared");
    if (existing) return existing;
    const by = ps.leadStrategistId ?? (await store.people.listActive()).find((p) => p.roles.includes("owner"))?.id;
    if (!by) throw new Error("Nobody at Oppllo to start the client chat.");
    await store.chat.createChannel({ id: newId(), kind: "shared", clientId: ps.clientId, name: null, createdById: by });
    return (await store.chat.clientChannel(ps.clientId, "shared"))!;
  }

  async function allowed(ps: PortalSession): Promise<PortalAllowed> {
    const [creatives, months, requests] = await Promise.all([deps.portal.creatives(ps), deps.portal.reports(ps), store.tasks.list({ scope: { kind: "all" }, clientId: ps.clientId, tags: ["Request"], limit: 200 })]);
    return { clientId: ps.clientId, creativeIds: new Set(creatives.map((c) => c.id.toLowerCase())), reportMonths: new Set(months.map((m) => m.slice(0, 7))), requestIds: new Set(requests.map((t) => t.id.toLowerCase())) };
  }

  const toView = (ps: PortalSession, a: PortalAllowed, now: Date) => (m: MessageRecord): PortalMessage => {
    const mine = m.portalUserId === ps.id;
    const removed = Boolean(m.deletedAt);
    return {
      id: m.id,
      mine,
      fromStaff: m.authorId !== null,
      authorName: m.authorId ? m.authorName : mine ? "You" : m.authorName,
      parts: removed ? [] : portalParts(m.body, appOrigin, a),
      body: mine && !removed ? m.body : null,
      file: !removed && m.file ? { name: m.file.name, size: m.file.size ? formatFileSize(m.file.size) : null } : null,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      edited: Boolean(m.editedAt),
      removed,
      canEdit: mine && !removed && now.getTime() - m.createdAt.getTime() <= EDIT_MINUTES * 60_000,
      canRemove: mine && !removed,
    };
  };

  const event = (ps: PortalSession, channelId: string, action: string, data: Record<string, unknown>): NewEvent => ({ actorId: null, action, entityType: "chat_channel", entityId: channelId, clientId: null, data: { by: ps.name, portalUserId: ps.id, ...data } });

  /** Their own message in their own chat, or nothing. */
  async function ownMessage(ps: PortalSession, messageId: string): Promise<MessageRecord | null> {
    const m = isId(messageId) ? await store.chat.findMessage(messageId) : null;
    return m && m.portalUserId === ps.id && m.channelId === (await store.chat.clientChannel(ps.clientId, "shared")) ? m : null;
  }

  return {
    emailReady: () => deps.emailReady,

    /** The client's view of their chat: the latest page, what waits for them, and it's marked read. */
    async view(ps: PortalSession): Promise<PortalChat> {
      const channelId = await channelOf(ps);
      const now = clock.now();
      const [rows, a, creatives, months, requests] = await Promise.all([
        store.chat.messages(channelId, { limit: PAGE_SIZE + 1 }),
        allowed(ps),
        deps.portal.creatives(ps),
        deps.portal.reports(ps),
        store.tasks.list({ scope: { kind: "all" }, clientId: ps.clientId, tags: ["Request"], statuses: ["todo", "in_progress", "in_review", "blocked"], limit: 200 }),
      ]);
      await store.chat.markPortalRead(channelId, ps.id, now);
      return {
        messages: rows.slice(0, PAGE_SIZE).reverse().map(toView(ps, a, now)),
        hasEarlier: rows.length > PAGE_SIZE,
        serverTime: now.toISOString(),
        cards: { creatives: creatives.length, latestReport: months[0]?.slice(0, 7) ?? null, openRequests: requests.length },
      };
    },

    /** New, changed or removed messages since the last look (the portal checks every few seconds while open). */
    async changes(ps: PortalSession, sinceRaw: string): Promise<Result<{ messages: PortalMessage[]; serverTime: string }>> {
      const since = new Date(sinceRaw);
      if (Number.isNaN(since.getTime())) return invalid("Bad time.");
      const channelId = await channelOf(ps);
      const now = clock.now();
      const rows = await store.chat.changes(channelId, since, 200);
      if (rows.length) await store.chat.markPortalRead(channelId, ps.id, now);
      return ok({ messages: rows.map(toView(ps, await allowed(ps), now)), serverTime: now.toISOString() });
    },

    /** A client writes: as themselves; the team hears about it (once an hour per chat). */
    async send(ps: PortalSession, raw: unknown, file: { name: string; bytes: Uint8Array } | null): Promise<Result<PortalMessage>> {
      const parsed = parse(z.object({ body: body.optional().default("") }), raw);
      if (!parsed.ok) return parsed;
      const text = parsed.value.body;
      if (!text && !file) return invalid("Write a message or attach a file.", { body: ["Write a message first."] });
      const channelId = await channelOf(ps);
      let stored: ChatFile | null = null;
      if (file) {
        const f = await storeChatFile(storage, channelId, file);
        if (!f.ok) return f;
        stored = f.value;
      }
      const now = clock.now();
      const id = newId();
      // The client's team: the lead strategist and the client's members (anyone else sees it in Chat's waiting list).
      const team = new Set([...(ps.leadStrategistId ? [ps.leadStrategistId] : []), ...(await store.clients.listMembers(ps.clientId)).map((m) => m.personId)]);
      const hour = now.toISOString().slice(0, 13);
      const notes: Array<NotificationWrite & { id: string }> = [...team].map((personId) => ({ id: newId(), personId, kind: "chat.client_message", title: `${ps.name} (${ps.clientName}) wrote in the client chat`, body: text.slice(0, 200) || stored?.name || null, link: `/chat/${channelId}`, entityType: "chat_channel", entityId: channelId, dedupeKey: `client-chat:${channelId}:${hour}` }));
      const r = await commit(store, async (repos) => {
        await repos.chat.addMessage({ id, channelId, authorId: null, portalUserId: ps.id, body: text, mentions: [], file: stored }, now);
        await repos.chat.markPortalRead(channelId, ps.id, now);
        if (notes.length) await repos.notifications.create(notes);
        return change(null, event(ps, channelId, "chat.message_sent", { messageId: id, fromClient: true }));
      });
      if (!r.ok) return r;
      const saved = await store.chat.findMessage(id);
      return saved ? ok(toView(ps, await allowed(ps), now)(saved)) : notFound("That message");
    },

    async edit(ps: PortalSession, raw: unknown): Promise<Result<PortalMessage>> {
      const parsed = parse(z.object({ messageId: z.uuid(), body: body.min(1, { message: "Write something, or remove the message." }) }), raw);
      if (!parsed.ok) return parsed;
      const m = await ownMessage(ps, parsed.value.messageId);
      if (!m || m.deletedAt) return notFound("That message");
      const now = clock.now();
      if (now.getTime() - m.createdAt.getTime() > EDIT_MINUTES * 60_000) return forbidden("Messages can be changed for 15 minutes. Remove it and write it again instead.");
      const r = await commit(store, async (repos) => {
        await repos.chat.updateMessage(m.id, { body: parsed.value.body, editedAt: now }, now);
        return change(null, event(ps, m.channelId, "chat.message_edited", { messageId: m.id, before: m.body, fromClient: true }));
      });
      if (!r.ok) return r;
      return ok(toView(ps, await allowed(ps), now)((await store.chat.findMessage(m.id))!));
    },

    /** Removing their own message leaves "Message removed"; nothing is hard-deleted. */
    async remove(ps: PortalSession, messageId: string): Promise<Result<null>> {
      const m = await ownMessage(ps, messageId);
      if (!m) return notFound("That message");
      if (m.deletedAt) return ok(null);
      const now = clock.now();
      return commit(store, async (repos) => {
        await repos.chat.updateMessage(m.id, { deletedAt: now }, now);
        return change(null, event(ps, m.channelId, "chat.message_removed", { messageId: m.id, fromClient: true }));
      });
    },

    /** A file in their chat: a short-lived link made for them. */
    async fileLink(ps: PortalSession, messageId: string): Promise<Result<{ url: string }>> {
      const m = isId(messageId) ? await store.chat.findMessage(messageId) : null;
      if (!m?.file || m.deletedAt || m.channelId !== (await store.chat.clientChannel(ps.clientId, "shared"))) return notFound("That file");
      if (m.file.provider === "external_link") return ok({ url: m.file.location });
      return ok({ url: await storage.getLink(m.file, { expiresInSeconds: LINK_SECONDS, downloadName: m.file.name, viewerId: `portal:${ps.id}` }) });
    },

    /**
     * After a staff message in a shared chat: email each live portal user of that client who hasn't read it, at most
     * once an hour each. Nothing at all when email isn't set up.
     */
    async alertClients(channelId: string): Promise<{ sent: number }> {
      if (!deps.emailReady) return { sent: 0 };
      const c = await store.chat.find(channelId);
      if (!c || c.kind !== "shared" || !c.clientId) return { sent: 0 };
      const now = clock.now();
      let sent = 0;
      for (const u of await store.portal.listForClient(c.clientId)) {
        if (u.revokedAt || !u.clientLive || u.contactEmail !== u.email.toLowerCase()) continue;
        if (!(await store.chat.portalUnread(channelId, u.id))) continue;
        if (!(await store.chat.claimAlert(channelId, u.id, now, ALERT_GAP_MINUTES))) continue;
        await deps.mailer.send({ to: u.email, subject: "You have a new message from Oppllo", text: `Hello ${u.contactName}, the Oppllo team has written to you about ${u.clientName}. Read and reply in your portal:\n\n${deps.appUrl}/portal/messages` });
        sent++;
      }
      return { sent };
    },
  };
}
export type ClientChatService = ReturnType<typeof createClientChatService>;
