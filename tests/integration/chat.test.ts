// Chat (Stage 12.1): who sees a channel follows the existing rules exactly (two clients, two private spaces, a
// strategist who sees every client, an intern, a view-only member, a client in the portal); mentions notify only
// people who may see; unread counts; edit window; removal; team channels; direct messages; paging; files.
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPostgresStorage } from "@/adapters/postgres";
import * as s from "@/db/schema";
import { newId } from "@/lib/id";
import { createChatService } from "@/services/chat";
import { createIdentityService } from "@/services/identity";
import { actorOf, addClient, addPerson, addProjectWithTask, eventsFor, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const storage = createPostgresStorage(process.env.DATABASE_URL_TEST!, {
  signLink: ({ fileId }, expiresAt, name, viewerId) => `/api/files/${fileId}?exp=${expiresAt.getTime()}&viewer=${viewerId}`,
});
let now = new Date("2026-10-21T06:30:00Z");
const clock = { today: () => "2026-10-21", now: () => now };
const chat = createChatService({ store, clock, storage });

const ids = { owner: "", strategist: "", designer: "", intern: "", accountant: "", zenith: "", alpha: "", founder: "", finance: "" };
const owner = () => actorOf(ids.owner, ["owner"]);
const strategist = () => actorOf(ids.strategist, ["strategist"]);
const designer = () => ({ ...actorOf(ids.designer, ["designer"]), fullName: "Nikhil Das" });
const intern = () => ({ ...actorOf(ids.intern, ["intern"]), fullName: "Rahul K" });
const accountant = () => actorOf(ids.accountant, ["accountant"]);
const idOf = <T extends { id: string }>(r: { ok: true; value: T } | { ok: false; error: { message: string } }) => {
  if (!r.ok) throw new Error(r.error.message);
  return r.value.id;
};
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? "ok" : r.error!.code);
const send = (a: ReturnType<typeof owner>, channelId: string, body: string) => chat.send(a, { channelId, body }, null);

beforeEach(async () => {
  await wipe(db);
  now = new Date("2026-10-21T06:30:00Z");
  ids.owner = await addPerson(db, "Faisal Rahman", ["owner"]);
  ids.strategist = await addPerson(db, "Anjali Nair", ["strategist"]);
  ids.designer = await addPerson(db, "Nikhil Das", ["designer"]);
  ids.intern = await addPerson(db, "Rahul K", ["intern"]);
  ids.accountant = await addPerson(db, "Lekha Menon", ["accountant"]);
  ids.zenith = await addClient(db, "Zenith IAS Academy", { members: [ids.designer] });
  ids.alpha = await addClient(db, "Alpha Nursing College");
  await addProjectWithTask(db, ids.zenith, { ownerId: ids.intern });
  ids.founder = newId();
  ids.finance = newId();
  await db.insert(s.clients).values([
    { id: ids.founder, name: "Founder office", isInternal: true, isPrivate: true, status: "active" },
    { id: ids.finance, name: "Finance", isInternal: true, isPrivate: true, status: "active" },
  ]);
  await db.insert(s.clientMembers).values([
    { clientId: ids.founder, personId: ids.designer, level: "edit" },
    { clientId: ids.finance, personId: ids.accountant, level: "view" },
  ]);
});

afterAll(async () => {
  await store.close();
  await client.end();
  await storage.close();
});

describe("who sees a channel", () => {
  it("follows the client's own visibility: private spaces only for live members, never via every-client access", async () => {
    expect(code(await chat.openClient(strategist(), ids.zenith))).toBe("ok");
    expect(code(await chat.openClient(strategist(), ids.alpha))).toBe("ok");
    expect(code(await chat.openClient(strategist(), ids.founder))).toBe("not_found");
    const founder = idOf(await chat.openClient(designer(), ids.founder));
    expect(code(await chat.conversation(strategist(), founder))).toBe("not_found");
    expect(code(await chat.conversation(accountant(), founder))).toBe("not_found");
    expect(code(await chat.openClient(designer(), ids.finance))).toBe("not_found");
    // The intern sees the client of their own task, nothing else.
    expect(code(await chat.openClient(intern(), ids.zenith))).toBe("ok");
    expect(code(await chat.openClient(intern(), ids.alpha))).toBe("not_found");
    const list = await chat.list(intern());
    expect(list.channels.map((c) => c.title)).toEqual(["Zenith IAS Academy"]);
    expect(list.canCreateTeam).toBe(false);
    // A client in the portal is not a person: no staff actor exists to open any of this.
    const portalUserId = newId();
    expect(await createIdentityService({ store }).actorFor(portalUserId)).toBeNull();
  });

  it("lets view-only space members read but not post", async () => {
    const finance = idOf(await chat.openClient(owner(), ids.finance));
    await send(owner(), finance, "GST filing on Friday");
    const c = await chat.conversation(accountant(), finance);
    expect(c.ok && c.value).toMatchObject({ canPost: false, messages: [{ body: "GST filing on Friday" }] });
    expect(c.ok && c.value.readOnlyReason).toMatch(/"View"/);
    expect(code(await send(accountant(), finance, "Noted"))).toBe("forbidden");
  });
});

describe("losing access", () => {
  it("takes the channel away at once: out of a space, past the end date, or out of the company", async () => {
    const founder = idOf(await chat.openClient(designer(), ids.founder));
    await send(owner(), founder, "Board meeting notes");
    await db.update(s.clientMembers).set({ expiresOn: "2026-01-01" }).where(sql`client_id = ${ids.founder} and person_id = ${ids.designer}`);
    expect(code(await chat.conversation(designer(), founder))).toBe("not_found");
    expect(await chat.unreadTotal(designer())).toBe(0);
    expect(await chat.search(designer(), "board meeting")).toEqual([]);
    await db.update(s.clientMembers).set({ expiresOn: null, deletedAt: now }).where(sql`client_id = ${ids.founder} and person_id = ${ids.designer}`);
    expect(code(await chat.conversation(designer(), founder))).toBe("not_found");
    await db.update(s.people).set({ status: "left" }).where(sql`id = ${ids.intern}`);
    expect(await createIdentityService({ store }).actorFor(ids.intern)).toBeNull();
  });
});

describe("messages", () => {
  it("are events when sent, changed and removed, for the owner's audit log", async () => {
    const zenith = idOf(await chat.openClient(strategist(), ids.zenith));
    const m = await send(strategist(), zenith, "Draft one");
    const mid = m.ok ? m.value.id : "";
    await chat.edit(strategist(), { messageId: mid, body: "Draft two" });
    await chat.remove(strategist(), mid);
    const events = await eventsFor(db, zenith);
    expect(events.map((e) => e.action)).toEqual(["chat.channel_created", "chat.message_sent", "chat.message_edited", "chat.message_removed"]);
    const edited = await db.execute<{ data: unknown }>(sql`select data from events where action = 'chat.message_edited'`);
    expect(edited[0]?.data).toMatchObject({ messageId: mid, before: "Draft one" });
  });

  it("notify only mentioned people who may see the channel, and search follows the same rule", async () => {
    const founder = idOf(await chat.openClient(designer(), ids.founder));
    const m = await send(designer(), founder, "Fundraise deck ready @Anjali Nair @Faisal Rahman");
    expect(m.ok && m.value.mentions).toEqual([ids.owner]);
    const notes = await db.execute<{ person_id: string; kind: string }>(sql`select person_id, kind from notifications`);
    expect(notes.map((n) => [n.person_id, n.kind])).toEqual([[ids.owner, "chat.mention"]]);
    expect(await chat.search(strategist(), "fundraise")).toEqual([]);
    expect((await chat.search(owner(), "fundraise deck")).map((x) => x.channelName)).toEqual(["Founder office"]);
  });

  it("count unread per channel and in total, until read", async () => {
    const zenith = idOf(await chat.openClient(strategist(), ids.zenith));
    await send(strategist(), zenith, "Open day post goes out Friday");
    await send(strategist(), zenith, "@Nikhil Das can you do the poster?");
    expect((await chat.list(designer())).channels.find((c) => c.id === zenith)?.unread).toBe(2);
    expect(await chat.unreadTotal(designer())).toBe(2);
    expect(await chat.unreadTotal(strategist())).toBe(0);
    await chat.conversation(designer(), zenith);
    expect(await chat.unreadTotal(designer())).toBe(0);
  });

  it("can be corrected by the writer for 15 minutes and removed any time, leaving 'message removed'", async () => {
    const zenith = idOf(await chat.openClient(strategist(), ids.zenith));
    const m = await send(strategist(), zenith, "Meeting at 3");
    const mid = m.ok ? m.value.id : "";
    expect(code(await chat.edit(designer(), { messageId: mid, body: "x" }))).toBe("forbidden");
    expect(await chat.edit(strategist(), { messageId: mid, body: "Meeting at 4" })).toMatchObject({ ok: true, value: { body: "Meeting at 4", editedAt: expect.any(Date) } });
    const since = now.toISOString();
    now = new Date(now.getTime() + 16 * 60_000);
    expect(code(await chat.edit(strategist(), { messageId: mid, body: "Meeting at 5" }))).toBe("forbidden");
    expect(code(await chat.remove(designer(), mid))).toBe("forbidden");
    expect((await chat.remove(strategist(), mid)).ok).toBe(true);
    const changes = await chat.changes(designer(), zenith, since);
    expect(changes.ok && changes.value.messages).toMatchObject([{ id: mid, body: "", deletedAt: expect.any(Date), canRemove: false }]);
  });

  it("page history 50 at a time", async () => {
    const zenith = idOf(await chat.openClient(strategist(), ids.zenith));
    for (let i = 1; i <= 55; i++) {
      now = new Date(now.getTime() + 1000);
      await send(strategist(), zenith, `Message ${i}`);
    }
    const c = await chat.conversation(designer(), zenith);
    expect(c.ok && [c.value.messages.length, c.value.hasEarlier, c.value.messages[0]?.body, c.value.messages.at(-1)?.body]).toEqual([50, true, "Message 6", "Message 55"]);
    const first = c.ok ? c.value.messages[0]! : null;
    const earlier = await chat.earlier(designer(), zenith, { createdAt: first!.createdAt.toISOString(), id: first!.id });
    expect(earlier.ok && [earlier.value.messages.map((x) => x.body), earlier.value.hasEarlier]).toEqual([["Message 1", "Message 2", "Message 3", "Message 4", "Message 5"], false]);
  });

  it("share files through the storage interface, opened only by people who see the chat", async () => {
    const zenith = idOf(await chat.openClient(strategist(), ids.zenith));
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const m = await chat.send(strategist(), { channelId: zenith, body: "" }, { name: "poster.png", bytes: png });
    expect(m.ok && m.value.file).toMatchObject({ name: "poster.png", isLink: false });
    const mid = m.ok ? m.value.id : "";
    expect((await chat.fileLink(designer(), mid)).ok).toBe(true);
    expect(code(await chat.fileLink(accountant(), mid))).toBe("ok"); // the accountant sees every client
    const outsider = await addPerson(db, "Sneha Joy", ["designer"]);
    expect(code(await chat.fileLink(actorOf(outsider, ["designer"]), mid))).toBe("not_found");
    expect(code(await chat.send(strategist(), { channelId: zenith, body: "" }, { name: "run.exe", bytes: new Uint8Array([0x4d, 0x5a, 0]) }))).toBe("invalid");
  });
});

describe("team channels and direct messages", () => {
  it("team channels: owner and strategists start them; members only; changes are events", async () => {
    expect(code(await chat.createTeam(designer(), { name: "Design" }))).toBe("forbidden");
    const team = idOf(await chat.createTeam(strategist(), { name: "Design crew", memberIds: [ids.designer] }));
    expect(code(await chat.conversation(intern(), team))).toBe("not_found");
    expect(code(await chat.conversation(owner(), team))).toBe("not_found");
    expect(code(await chat.manage(designer(), { channelId: team, action: "add", personId: ids.intern }))).toBe("forbidden");
    expect((await chat.manage(strategist(), { channelId: team, action: "add", personId: ids.intern })).ok).toBe(true);
    expect(code(await chat.conversation(intern(), team))).toBe("ok");
    expect((await chat.manage(strategist(), { channelId: team, action: "archive" })).ok).toBe(true);
    expect(code(await send(designer(), team, "hello"))).toBe("forbidden");
    expect((await eventsFor(db, team)).map((e) => e.action)).toEqual(["chat.channel_created", "chat.member_added", "chat.channel_archived"]);
  });

  it("direct messages: reopen the same chat for the same people; the others hear once a day", async () => {
    const dm = idOf(await chat.direct(designer(), { personIds: [ids.intern] }));
    expect(idOf(await chat.direct(intern(), { personIds: [ids.designer] }))).toBe(dm);
    expect(idOf(await chat.direct(designer(), { personIds: [ids.intern, ids.strategist] }))).not.toBe(dm);
    await send(designer(), dm, "Can you resize the banner?");
    await send(designer(), dm, "And the story version");
    const notes = await db.execute<{ person_id: string; kind: string }>(sql`select person_id, kind from notifications`);
    expect(notes.map((n) => [n.person_id, n.kind])).toEqual([[ids.intern, "chat.direct"]]);
    expect(code(await chat.conversation(strategist(), dm))).toBe("not_found");
    const list = await chat.list(intern());
    expect(list.channels.find((c) => c.id === dm)?.title).toBe("Nikhil Das");
  });
});
