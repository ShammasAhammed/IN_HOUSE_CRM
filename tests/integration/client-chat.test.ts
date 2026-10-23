// Client chat (Stage 12.6), against the database: a client sees only their own shared chat (never the staff channel,
// other clients or spaces), internal links stay hidden, @AI never posts there, who may write, revoking closes it, the
// waiting list, email alerts once an hour (and none without email), and events.
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { newId } from "@/lib/id";
import type { AiModel, AiResult, FileStorage, Mailer } from "@/repositories";
import { createAiService } from "@/services/ai";
import { createChatService } from "@/services/chat";
import { createChatAiService, SHARED_AI } from "@/services/chat-ai";
import { createClientChatService } from "@/services/client-chat";
import { createClientService } from "@/services/clients";
import { createPortalService, type PortalSession } from "@/services/portal";
import { createProjectService } from "@/services/projects";
import { createTaskService } from "@/services/tasks";
import { actorOf, addClient, addPerson, addProjectWithTask, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
let now = new Date("2026-10-21T06:30:00Z");
const clock = { today: () => now.toISOString().slice(0, 10), now: () => now };
const mails: Array<{ to: string; subject: string }> = [];
const mailer: Mailer = { send: async (m) => void mails.push(m) };

function build(emailReady = true) {
  const chat = createChatService({ store, clock, storage: {} as FileStorage });
  const portal = createPortalService({ store, clock, storage: {} as FileStorage, mailer, emailReady, appUrl: "https://one.oppllo.com", logLinks: false });
  const clientChat = createClientChatService({ store, clock, storage: {} as FileStorage, mailer, emailReady, appUrl: "https://one.oppllo.com", portal });
  return { chat, portal, clientChat };
}

const ids = { owner: "", strategist: "", designer: "", accountant: "", intern: "", zenith: "", alpha: "", founder: "", zenithUser: "", alphaUser: "", task: "", request: "" };
const named = (id: string, roles: Parameters<typeof actorOf>[1], fullName: string) => ({ ...actorOf(id, roles), fullName });
const strategist = () => named(ids.strategist, ["strategist"], "Anjali Nair");
const designer = () => named(ids.designer, ["designer"], "Nikhil Das");
const accountant = () => named(ids.accountant, ["accountant"], "Lekha Menon");
const intern = () => named(ids.intern, ["intern"], "Rahul K");
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? "ok" : r.error!.code);
const session = async (id: string): Promise<PortalSession> => (await build().portal.session(id))!;
const sharedOf = async (chat: ReturnType<typeof build>["chat"], clientId = ids.zenith) => {
  const r = await chat.openShared(strategist(), clientId);
  if (!r.ok) throw new Error(r.error.message);
  return r.value.id;
};

async function portalUser(clientId: string, email: string) {
  const [contact] = await db.execute<{ id: string }>(sql`select id from client_contacts where client_id = ${clientId}`);
  await db.update(s.clientContacts).set({ email }).where(sql`id = ${contact!.id}`);
  const id = newId();
  await db.insert(s.portalUsers).values({ id, clientId, contactId: contact!.id, email, invitedById: ids.owner });
  return id;
}

beforeEach(async () => {
  await wipe(db);
  mails.length = 0;
  now = new Date("2026-10-21T06:30:00Z");
  ids.owner = await addPerson(db, "Faisal Rahman", ["owner"]);
  ids.strategist = await addPerson(db, "Anjali Nair", ["strategist"]);
  ids.designer = await addPerson(db, "Nikhil Das", ["designer"]);
  ids.accountant = await addPerson(db, "Lekha Menon", ["accountant"]);
  ids.intern = await addPerson(db, "Rahul K", ["intern"]);
  ids.zenith = await addClient(db, "Zenith IAS Academy", { strategistId: ids.strategist, members: [ids.designer] });
  ids.alpha = await addClient(db, "Alpha Nursing College");
  ids.founder = newId();
  await db.insert(s.clients).values({ id: ids.founder, name: "Founder office", isInternal: true, isPrivate: true, status: "active" });
  const p = await addProjectWithTask(db, ids.zenith, { ownerId: ids.designer });
  ids.task = p.taskId;
  ids.request = newId();
  await db.insert(s.tasks).values({ id: ids.request, projectId: p.projectId, clientId: ids.zenith, title: "Client asked: new banner", tags: ["Request"], rank: "a1" });
  ids.zenithUser = await portalUser(ids.zenith, "principal@zenith.example");
  ids.alphaUser = await portalUser(ids.alpha, "dean@alpha.example");
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("what a client sees", () => {
  it("only their own shared chat: never the staff channel, another client's chat or a space", async () => {
    const { chat, clientChat } = build();
    const staffOnly = await chat.openClient(strategist(), ids.zenith);
    await chat.send(strategist(), { channelId: staffOnly.ok ? staffOnly.value.id : "", body: "Internal: they pay ₹45,000, keep it tight" }, null);
    const shared = await sharedOf(chat);
    await chat.send(strategist(), { channelId: shared, body: "Hello! The poster is coming tomorrow." }, null);
    const alphaShared = await sharedOf(chat, ids.alpha);
    await chat.send(strategist(), { channelId: alphaShared, body: "Alpha only" }, null);
    const view = await clientChat.view(await session(ids.zenithUser));
    expect(view.messages.map((m) => [m.authorName, m.parts.map((x) => (x.kind === "text" ? x.text : x.kind)).join("")])).toEqual([["Anjali Nair", "Hello! The poster is coming tomorrow."]]);
    expect(JSON.stringify(await clientChat.view(await session(ids.alphaUser)))).not.toMatch(/poster|45,000/);
    expect(code(await chat.openShared(named(ids.owner, ["owner"], "Faisal Rahman"), ids.founder))).toBe("invalid");
    expect(await store.chat.clientChannel(ids.founder, "shared")).toBeNull();
  });

  it("follows links the portal can open and hides the rest", async () => {
    const { chat, clientChat } = build();
    const shared = await sharedOf(chat);
    await chat.send(strategist(), { channelId: shared, body: `Your request: https://one.oppllo.com/tasks/${ids.request} (our task: https://one.oppllo.com/tasks/${ids.task})` }, null);
    const parts = (await clientChat.view(await session(ids.zenithUser))).messages[0]!.parts;
    expect(parts.filter((p) => p.kind !== "text")).toEqual([{ kind: "portal", href: "/portal/requests", label: "Your request" }, { kind: "internal" }]);
    expect(JSON.stringify(parts)).not.toContain(ids.task);
  });
});

describe("who writes", () => {
  it("the client's team and the client's portal users; others who see the client read only", async () => {
    const { chat, clientChat } = build();
    const shared = await sharedOf(chat);
    expect(code(await chat.send(designer(), { channelId: shared, body: "Hi from the design team" }, null))).toBe("ok");
    const readOnly = await chat.send(accountant(), { channelId: shared, body: "Hi" }, null);
    expect(readOnly).toMatchObject({ ok: false, error: { code: "forbidden", message: expect.stringMatching(/client's team/) } });
    expect(code(await chat.conversation(accountant(), shared))).toBe("ok");
    expect(code(await chat.conversation(intern(), shared))).toBe("not_found");
    const mine = await clientChat.send(await session(ids.zenithUser), { body: "When is the reel ready?" }, null);
    expect(mine.ok && mine.value).toMatchObject({ mine: true, fromStaff: false, authorName: "You" });
    const row = (await db.execute<{ author_id: string | null; portal_user_id: string }>(sql`select author_id, portal_user_id from chat_messages where body = 'When is the reel ready?'`))[0];
    expect(row).toEqual({ author_id: null, portal_user_id: ids.zenithUser });
    // Staff see it under the client contact's name; the team is told.
    const c = await chat.conversation(strategist(), shared);
    expect(c.ok && c.value.messages.at(-1)?.authorName).toBe("Zenith IAS Academy Director");
    expect((await db.execute<{ person_id: string }>(sql`select person_id from notifications where kind = 'chat.client_message' order by person_id`)).map((n) => n.person_id).sort()).toEqual([ids.strategist, ids.designer].sort());
    // Their own message, within 15 minutes; never someone else's.
    const id = mine.ok ? mine.value.id : "";
    expect(code(await clientChat.edit(await session(ids.alphaUser), { messageId: id, body: "x" }))).toBe("not_found");
    expect(code(await clientChat.edit(await session(ids.zenithUser), { messageId: id, body: "When is the reel ready, please?" }))).toBe("ok");
    expect(code(await clientChat.remove(await session(ids.zenithUser), id))).toBe("ok");
    expect((await clientChat.view(await session(ids.zenithUser))).messages.at(-1)).toMatchObject({ removed: true, parts: [], body: null });
  });

  it("revoking a portal user or removing the contact ends their session, and with it the chat", async () => {
    const { portal } = build();
    expect(await portal.session(ids.zenithUser)).not.toBeNull();
    await db.update(s.portalUsers).set({ revokedAt: now }).where(sql`id = ${ids.zenithUser}`);
    expect(await portal.session(ids.zenithUser)).toBeNull();
    await db.update(s.clientContacts).set({ email: null }).where(sql`client_id = ${ids.alpha}`);
    expect(await portal.session(ids.alphaUser)).toBeNull();
  });
});

describe("staff side", () => {
  it("lists clients waiting for a reply, oldest first, until someone from the team answers", async () => {
    const { chat, clientChat } = build();
    const shared = await sharedOf(chat);
    const alphaShared = await sharedOf(chat, ids.alpha);
    await clientChat.send(await session(ids.alphaUser), { body: "Any update?" }, null);
    now = new Date("2026-10-21T08:30:00Z");
    await clientChat.send(await session(ids.zenithUser), { body: "Hello?" }, null);
    expect((await chat.list(strategist())).waiting.map((w) => [w.channelId, w.clientName])).toEqual([
      [alphaShared, "Alpha Nursing College"],
      [shared, "Zenith IAS Academy"],
    ]);
    await chat.send(strategist(), { channelId: shared, body: "Hi! Today evening." }, null);
    expect((await chat.list(strategist())).waiting.map((w) => w.clientName)).toEqual(["Alpha Nursing College"]);
  });

  it("@AI in the shared chat never posts there; the asker gets a private answer", async () => {
    const model: AiModel = { connected: true, provider: "anthropic", model: "claude-opus-5-5", answer: async (): Promise<AiResult> => ({ kind: "answer", outcome: "answered", text: "Burn is 120% (internal)", toolCalls: [], usage: [] }) };
    const { chat } = build();
    const ai = createAiService({ store, clock, models: [model], inrPerUsd: 90 });
    const chatAi = createChatAiService({ store, clock, ai, chat, tools: { clients: createClientService({ store, clock }), projects: createProjectService({ store, clock }), tasks: createTaskService({ store, clock }) } as never });
    const shared = await sharedOf(chat);
    const q = await chat.send(strategist(), { channelId: shared, body: "@AI how are hours looking?" }, null);
    const before = Number((await db.execute<{ n: number }>(sql`select count(*)::int as n from chat_messages`))[0]!.n);
    expect(await chatAi.answer(strategist(), q.ok ? q.value.id : "")).toMatchObject({ ok: false, error: { message: SHARED_AI } });
    const priv = await chatAi.askPrivately(strategist(), shared, "how are hours looking?");
    expect(priv).toMatchObject({ ok: true, value: { text: "Burn is 120% (internal)" } });
    expect(Number((await db.execute<{ n: number }>(sql`select count(*)::int as n from chat_messages`))[0]!.n)).toBe(before);
  });
});

describe("alerts and events", () => {
  it("emails a client at most once an hour while they haven't read, and never without email", async () => {
    const { chat, clientChat } = build();
    const shared = await sharedOf(chat);
    await chat.send(strategist(), { channelId: shared, body: "Draft ready" }, null);
    expect(await clientChat.alertClients(shared)).toEqual({ sent: 1 });
    expect(mails).toEqual([expect.objectContaining({ to: "principal@zenith.example", subject: "You have a new message from Oppllo" })]);
    now = new Date("2026-10-21T07:00:00Z");
    await chat.send(strategist(), { channelId: shared, body: "And the caption" }, null);
    expect(await clientChat.alertClients(shared)).toEqual({ sent: 0 });
    // They read it: nothing to tell, even after the hour.
    await clientChat.view(await session(ids.zenithUser));
    now = new Date("2026-10-21T08:00:00Z");
    expect(await clientChat.alertClients(shared)).toEqual({ sent: 0 });
    await chat.send(strategist(), { channelId: shared, body: "One more thing" }, null);
    expect(await clientChat.alertClients(shared)).toEqual({ sent: 1 });
    const off = build(false);
    await chat.send(strategist(), { channelId: shared, body: "Later" }, null);
    now = new Date("2026-10-21T10:00:00Z");
    expect(await off.clientChat.alertClients(shared)).toEqual({ sent: 0 });
    expect(mails).toHaveLength(2);
  });

  it("every message from either side is an event, without the client id", async () => {
    const { chat, clientChat } = build();
    const shared = await sharedOf(chat);
    await chat.send(strategist(), { channelId: shared, body: "Hi" }, null);
    const m = await clientChat.send(await session(ids.zenithUser), { body: "Hello" }, null);
    await clientChat.remove(await session(ids.zenithUser), m.ok ? m.value.id : "");
    const events = await db.execute<{ action: string; actor_id: string | null; client_id: string | null }>(sql`select action, actor_id, client_id from events where entity_id = ${shared} and action like 'chat.message%' order by occurred_at, id`);
    expect(events.map((e) => [e.action, e.actor_id, e.client_id])).toEqual([
      ["chat.message_sent", ids.strategist, null],
      ["chat.message_sent", null, null],
      ["chat.message_removed", null, null],
    ]);
  });
});
