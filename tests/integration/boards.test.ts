// Idea Boards (Stage 13.1): levels on clients and two private spaces, the version check, snapshots and restore,
// comments and @mentions that never reach people outside, search scope, archive and restore, voting (hidden until
// revealed, votes per person), templates, images and the timer.
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPostgresStorage } from "@/adapters/postgres";
import * as s from "@/db/schema";
import { newId } from "@/lib/id";
import { createBoardsService } from "@/services/boards";
import { sceneBuilder } from "@/services/rules/board-templates";
import { actorOf, addClient, addPerson, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const storage = createPostgresStorage(process.env.DATABASE_URL_TEST!, { signLink: ({ fileId }) => `/api/files/${fileId}` });
let now = new Date("2026-10-21T06:30:00Z");
const clock = { today: () => now.toISOString().slice(0, 10), now: () => now };
const boards = createBoardsService({ store, clock, storage });

const ids = { owner: "", strategist: "", marketer: "", designer: "", accountant: "", intern: "", zenith: "", founder: "", finance: "" };
const named = (id: string, roles: Parameters<typeof actorOf>[1], fullName: string) => ({ ...actorOf(id, roles), fullName });
const owner = () => named(ids.owner, ["owner"], "Faisal Rahman");
const strategist = () => named(ids.strategist, ["strategist"], "Anjali Nair");
const marketer = () => named(ids.marketer, ["performance_marketer"], "Rahul Krishnan");
const designer = () => named(ids.designer, ["designer"], "Nikhil Das");
const accountant = () => named(ids.accountant, ["accountant"], "Joseph Varghese");
const intern = () => named(ids.intern, ["intern"], "Arun Babu");
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? "ok" : r.error!.code);
function value<T>(r: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

let n = 0;
/** A small scene: stickies with these texts. */
function scene(...texts: string[]) {
  const b = sceneBuilder(() => `t${++n}`);
  const stickies = texts.map((t, i) => b.sticky(t, i * 200, 0));
  return { elements: b.elements, stickies };
}

beforeEach(async () => {
  await wipe(db);
  now = new Date("2026-10-21T06:30:00Z");
  ids.owner = await addPerson(db, "Faisal Rahman", ["owner"]);
  ids.strategist = await addPerson(db, "Anjali Nair", ["strategist"]);
  ids.marketer = await addPerson(db, "Rahul Krishnan", ["performance_marketer"]);
  ids.designer = await addPerson(db, "Nikhil Das", ["designer"]);
  ids.accountant = await addPerson(db, "Joseph Varghese", ["accountant"]);
  ids.intern = await addPerson(db, "Arun Babu", ["intern"]);
  ids.zenith = await addClient(db, "Zenith IAS Academy", { strategistId: ids.strategist, members: [ids.designer] });
  ids.founder = newId();
  ids.finance = newId();
  await db.insert(s.clients).values([
    { id: ids.founder, name: "Founder office", isInternal: true, isPrivate: true, status: "active" },
    { id: ids.finance, name: "Finance", isInternal: true, isPrivate: true, status: "active" },
  ]);
  await db.insert(s.clientMembers).values([
    { clientId: ids.founder, personId: ids.designer, level: "edit" },
    { clientId: ids.founder, personId: ids.marketer, level: "view" },
    { clientId: ids.finance, personId: ids.accountant, level: "comment" },
  ]);
});

afterAll(async () => {
  await store.close();
  await client.end();
  await storage.close();
});

describe("levels and privacy", () => {
  it("client boards: strategists manage, makers draw, others comment; interns outside the client see nothing", async () => {
    const { id } = value(await boards.create(strategist(), { clientId: ids.zenith, title: "NEET campaign", template: "campaign_plan" }));
    const page = value(await boards.open(designer(), id));
    expect([page.level, page.board.clientName, page.items.length > 5]).toEqual(["edit", "Zenith IAS Academy", true]);
    expect(value(await boards.open(accountant(), id)).level).toBe("comment");
    expect(code(await boards.save(accountant(), { boardId: id, baseVersion: 1, elements: [] }))).toBe("forbidden");
    expect(code(await boards.save(designer(), { boardId: id, baseVersion: 1, elements: page.scene.elements }))).toBe("ok");
    expect(code(await boards.archive(marketer(), id, true))).toBe("forbidden");
    expect(code(await boards.open(intern(), id))).toBe("not_found");
    expect(code(await boards.create(accountant(), { clientId: ids.zenith, title: "Mine" }))).toBe("forbidden");
  });

  it("two private spaces: members get their level, nobody else sees them, the owner sees all", async () => {
    const { id: founderBoard } = value(await boards.create(designer(), { clientId: ids.founder, title: "Hiring plan" }));
    const { id: financeBoard } = value(await boards.create(owner(), { clientId: ids.finance, title: "Budget ideas" }));
    expect(code(await boards.create(marketer(), { clientId: ids.founder, title: "No" }))).toBe("forbidden");
    expect(value(await boards.open(marketer(), founderBoard)).level).toBe("view");
    expect(code(await boards.save(marketer(), { boardId: founderBoard, baseVersion: 1, elements: [] }))).toBe("forbidden");
    expect(value(await boards.open(accountant(), financeBoard)).level).toBe("comment");
    for (const who of [strategist(), accountant()]) expect(code(await boards.open(who, founderBoard))).toBe("not_found");
    for (const who of [strategist(), designer(), marketer()]) expect(code(await boards.open(who, financeBoard))).toBe("not_found");
    expect(value(await boards.open(owner(), founderBoard)).level).toBe("manage");
    const titles = async (who: ReturnType<typeof owner>) => value(await boards.library(who)).boards.map((b) => b.title).sort();
    expect(await titles(strategist())).toEqual([]);
    expect(await titles(designer())).toEqual(["Hiring plan"]);
    expect(await titles(accountant())).toEqual(["Budget ideas"]);
    expect(await titles(owner())).toEqual(["Budget ideas", "Hiring plan"]);
  });
});

describe("saving safely and history", () => {
  it("refuses a save from an old version, keeps automatic versions, named snapshots and restore", async () => {
    const { id } = value(await boards.create(marketer(), { clientId: ids.zenith, title: "Plan" }));
    const a = scene("Idea A");
    const v2 = value(await boards.save(marketer(), { boardId: id, baseVersion: 1, elements: a.elements, appState: { viewBackgroundColor: "#fff", selectedElementIds: { x: true } } })).version;
    expect(v2).toBe(2);
    const late = await boards.save(designer(), { boardId: id, baseVersion: 1, elements: scene("Lost").elements });
    expect(late.ok ? "" : late.error.message).toMatch(/Someone else changed this board/);
    expect(code(await boards.snapshot(marketer(), id, "Before client review"))).toBe("ok");
    now = new Date(now.getTime() + 5 * 60_000);
    expect(value(await boards.save(designer(), { boardId: id, baseVersion: 2, elements: scene("Idea B").elements })).version).toBe(3);
    let page = value(await boards.open(designer(), id));
    expect(page.items.map((i) => i.text)).toEqual(["Idea B"]);
    expect(page.scene.appState).toEqual({}); // only lasting settings are kept, and this one wasn't sent this time
    // One automatic version (the empty start, before the first save; the next save was within 15 minutes) and the snapshot.
    expect(page.versions.map((v) => [v.name, v.version])).toEqual([
      ["Before client review", 2],
      [null, 1],
    ]);
    const snap = page.versions.find((v) => v.name)!;
    expect(value(await boards.restoreVersion(designer(), id, snap.id)).version).toBe(4);
    page = value(await boards.open(designer(), id));
    expect(page.items.map((i) => i.text)).toEqual(["Idea A"]);
    expect(page.versions[0]!.name).toBe("Before restoring “Before client review”");
    expect(code(await boards.restoreVersion(accountant(), id, snap.id))).toBe("forbidden");
    // Within 15 minutes, but most of a sizeable board went: the state before is kept anyway.
    const big = scene(...Array.from({ length: 8 }, (_, i) => `Idea ${i}`));
    const v5 = value(await boards.save(designer(), { boardId: id, baseVersion: 4, elements: big.elements })).version;
    value(await boards.save(designer(), { boardId: id, baseVersion: v5, elements: [] }));
    const kept = value(await boards.open(designer(), id)).versions[0]!;
    expect([kept.name, kept.objectCount]).toEqual([null, 16]);
    const events = await db.execute<{ action: string }>(sql`select action from events where entity_type = 'board' order by occurred_at, action`);
    expect(events.map((e) => e.action)).toEqual(["board.created", "board.saved", "board.snapshot", "board.saved", "board.version_restored", "board.saved", "board.saved"]);
  });
});

describe("comments and mentions", () => {
  it("pins comments to stickies and tells only mentioned people who can see the board", async () => {
    const { id } = value(await boards.create(designer(), { clientId: ids.founder, title: "Hiring plan" }));
    const { elements, stickies } = scene("Hire a video editor");
    value(await boards.save(designer(), { boardId: id, baseVersion: 1, elements }));
    expect(code(await boards.comment(marketer(), { boardId: id, body: "can't, view only" }))).toBe("forbidden");
    value(await boards.comment(owner(), { boardId: id, elementId: stickies[0]!.id, body: "@Anjali Nair @Rahul Krishnan @Nikhil Das thoughts?" }));
    expect(code(await boards.comment(owner(), { boardId: id, elementId: "nope", body: "x" }))).toBe("not_found");
    const notes = await db.execute<{ person_id: string; kind: string; link: string }>(sql`select person_id, kind, link from notifications order by kind, person_id`);
    expect(notes.map((x) => [x.person_id, x.kind])).toEqual(
      [
        [ids.designer, "board.mentioned"],
        [ids.marketer, "board.mentioned"],
      ].sort((p, q) => p[1]!.localeCompare(q[1]!) || p[0]!.localeCompare(q[0]!)),
    );
    expect(notes[0]!.link).toBe(`/boards/${id}?on=${stickies[0]!.id}`);
    const st = value(await boards.state(designer(), id));
    expect(st.comments.map((c) => [c.elementId, c.authorName, c.mine, c.canRemove])).toEqual([[stickies[0]!.id, "Faisal Rahman", false, false]]);
    expect(code(await boards.removeComment(designer(), st.comments[0]!.id))).toBe("forbidden");
    expect(code(await boards.removeComment(owner(), st.comments[0]!.id))).toBe("ok");
  });

  it("reactions need comment level and toggle", async () => {
    const { id } = value(await boards.create(strategist(), { clientId: ids.zenith, title: "Retro", template: "retro" }));
    const target = value(await boards.open(accountant(), id)).items[0]!.id;
    expect(value(await boards.react(accountant(), id, target, "🔥")).on).toBe(true);
    expect(value(await boards.react(designer(), id, target, "🔥")).on).toBe(true);
    expect(value(await boards.react(accountant(), id, target, "🔥")).on).toBe(false);
    expect(code(await boards.react(accountant(), id, target, "🦄"))).toBe("invalid");
    expect(value(await boards.state(designer(), id)).reactions).toEqual([{ elementId: target, emoji: "🔥", count: 1, mine: true }]);
  });
});

describe("library", () => {
  it("searches titles, tags and the words on boards, only where you can see; archive and restore", async () => {
    const { id: f } = value(await boards.create(designer(), { clientId: ids.founder, title: "Hiring", elements: scene("Parent webinar").elements }));
    const { id: z } = value(await boards.create(strategist(), { clientId: ids.zenith, title: "Ideas", section: "Campaigns", tags: ["neet"], elements: scene("Parent webinar too").elements }));
    const q = async (who: ReturnType<typeof owner>, text: string) => value(await boards.library(who, { q: text })).boards.map((b) => b.id);
    expect(await q(strategist(), "webinar")).toEqual([z]);
    expect((await q(designer(), "WEBINAR")).sort()).toEqual([f, z].sort());
    expect(await q(designer(), "neet")).toEqual([z]);
    expect(await q(designer(), "100%")).toEqual([]);
    const lib = value(await boards.library(designer(), { clientId: ids.zenith }));
    expect([lib.sections, lib.tags, lib.canCreate]).toEqual([["Campaigns"], ["neet"], true]);
    expect(code(await boards.archive(strategist(), z, true))).toBe("ok");
    expect(await q(strategist(), "webinar")).toEqual([]);
    expect(value(await boards.library(strategist(), { archived: true })).boards.map((b) => b.id)).toEqual([z]);
    expect(code(await boards.save(strategist(), { boardId: z, baseVersion: 1, elements: [] }))).toBe("invalid");
    expect(code(await boards.archive(strategist(), z, false))).toBe("ok");
    expect(code(await boards.favourite(designer(), z, true))).toBe("ok");
    expect(value(await boards.library(designer(), { clientId: ids.zenith })).boards[0]!.favourite).toBe(true);
    expect(value(await boards.library(strategist(), { clientId: ids.zenith })).boards[0]!.favourite).toBe(false);
  });
});

describe("voting", () => {
  it("votes per person, hidden until revealed, then counted", async () => {
    const { id } = value(await boards.create(designer(), { clientId: ids.founder, title: "Pick one" }));
    const { elements, stickies } = scene("Option A", "Option B");
    value(await boards.save(designer(), { boardId: id, baseVersion: 1, elements }));
    const [a, b] = stickies.map((x) => x.id) as [string, string];
    expect(code(await boards.vote(marketer(), id, a, true))).toBe("invalid"); // not open yet
    expect(code(await boards.voting(marketer(), id, { start: 2 }))).toBe("forbidden");
    value(await boards.voting(designer(), id, { start: 2 }));
    value(await boards.vote(marketer(), id, b, true));
    value(await boards.vote(marketer(), id, b, true));
    expect(code(await boards.vote(marketer(), id, a, true))).toBe("invalid");
    value(await boards.vote(marketer(), id, b, false));
    value(await boards.vote(marketer(), id, a, true));
    value(await boards.vote(designer(), id, a, true));
    expect(code(await boards.vote(designer(), id, "nope", true))).toBe("not_found");
    const hidden = value(await boards.state(designer(), id)).voting!;
    expect([hidden.myVotes, hidden.left, hidden.voters, hidden.results]).toEqual([[a], 1, 2, null]);
    value(await boards.voting(designer(), id, "reveal"));
    const shown = value(await boards.state(marketer(), id)).voting!;
    expect(shown.results).toEqual([
      { elementId: a, text: "Option A", votes: 2 },
      { elementId: b, text: "Option B", votes: 1 },
    ]);
    expect(code(await boards.vote(marketer(), id, a, true))).toBe("invalid"); // closed once revealed
    value(await boards.voting(designer(), id, { start: 1 }));
    expect(value(await boards.state(marketer(), id)).voting!.myVotes).toEqual([]); // a new round starts clean
  });
});

describe("templates, images and the timer", () => {
  it("each template opens with its frames; images go through storage; the timer is shared", async () => {
    const { id } = value(await boards.create(strategist(), { clientId: ids.zenith, title: "SWOT", template: "swot" }));
    const page = value(await boards.open(designer(), id));
    expect(page.frames.map((f) => f.name)).toEqual(["Strengths", "Weaknesses", "Opportunities", "Threats"]);
    const [row] = await db.execute<{ search_text: string; object_count: number }>(sql`select search_text, object_count from boards where id = ${id}`);
    expect(row!.search_text).toContain("Opportunities");
    expect(row!.object_count).toBe(page.scene.elements.length);
    const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    expect(code(await boards.addImage(designer(), id, { key: "img_12345678", contentType: "image/svg+xml", bytes: png }))).toBe("invalid");
    expect(code(await boards.addImage(designer(), id, { key: "img_12345678", contentType: "image/png", bytes: new Uint8Array(3_600_000) }))).toBe("invalid");
    expect(code(await boards.addImage(accountant(), id, { key: "img_12345678", contentType: "image/png", bytes: png }))).toBe("forbidden");
    expect(code(await boards.addImage(designer(), id, { key: "img_12345678", contentType: "image/png", bytes: png }))).toBe("ok");
    expect(Array.from(value(await boards.image(accountant(), id, "img_12345678")).bytes)).toEqual(Array.from(png));
    expect(code(await boards.image(intern(), id, "img_12345678"))).toBe("not_found");
    value(await boards.timer(designer(), id, { minutes: 5, sound: true }));
    expect(value(await boards.state(accountant(), id)).timer).toMatchObject({ endsAt: "2026-10-21T06:35:00.000Z", sound: true });
    expect(code(await boards.timer(accountant(), id, null))).toBe("forbidden");
  });
});
