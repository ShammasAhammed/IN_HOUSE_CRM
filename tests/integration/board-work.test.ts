// Boards connected to the work (Stage 13.2): sticky → task through the task service's checks, live cards that show
// only what the viewer may see ("No access" otherwise, private spaces too), the swipe file (search scope, privacy,
// tags), videos only with Drive, Meta oEmbed with and without access, "Add to board", and the phone share inbox.
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPostgresStorage } from "@/adapters/postgres";
import * as s from "@/db/schema";
import { newId } from "@/lib/id";
import type { FileStorage, PublicWeb } from "@/repositories";
import { createAssetService } from "@/services/assets";
import { createBoardCardsService } from "@/services/board-cards";
import { createBoardsService } from "@/services/boards";
import { createClientLinksService } from "@/services/client-links";
import { createDocService } from "@/services/docs";
import { createKnowledgeService } from "@/services/knowledge";
import { createResultService } from "@/services/results";
import { sceneBuilder } from "@/services/rules/board-templates";
import { cardUrl } from "@/services/rules/references";
import { createSwipeService } from "@/services/swipe";
import { createTaskService } from "@/services/tasks";
import { actorOf, addClient, addPerson, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const storage = createPostgresStorage(process.env.DATABASE_URL_TEST!, { signLink: ({ fileId }) => `/api/files/${fileId}` });
const now = new Date("2026-10-21T06:30:00Z");
const clock = { today: () => "2026-10-21", now: () => now };

const pages: Record<string, string> = { "https://zenith.example/webinar": `<title>Parent webinar</title><meta property="og:description" content="Join us"><meta property="og:image" content="https://zenith.example/cover.jpg">` };
let metaToken = false;
const web: PublicWeb = {
  page: async (url) => (pages[url] ? { ok: true, value: { url, html: pages[url]! } } : { ok: false, reason: "The site answered 404." }),
  youtube: async () => ({ ok: true, value: { title: "NEET topper interview", author: "Zenith" } }),
  metaEmbed: async (_url, kind) => (metaToken ? { ok: true, value: { html: `<blockquote class="instagram-media">post</blockquote>`, title: "Reel", author: "zenith.ias" } } : { ok: false, reason: kind === "instagram" ? "not_configured" : "x" }),
};
const tasks = createTaskService({ store, clock });
const boards = createBoardsService({ store, clock, storage, tasks, docs: createDocService({ store, clock }) });
const swipeWith = (st: FileStorage = storage) => createSwipeService({ store, clock, storage: st, web, boards });
const swipe = swipeWith();
const cards = createBoardCardsService({
  store,
  clock,
  sources: { tasks, assets: createAssetService({ store, storage, clock }), results: createResultService({ store, clock, ads: {} as never }), clientLinks: createClientLinksService({ store, clock, storage, google: { connected: false } as never }), docs: createDocService({ store, clock }), knowledge: createKnowledgeService({ store, clock, storage }), swipe },
});

const ids = { owner: "", strategist: "", designer: "", marketer: "", intern: "", zenith: "", other: "", founder: "", project: "", founderProject: "", otherProject: "" };
const named = (id: string, roles: Parameters<typeof actorOf>[1], fullName: string) => ({ ...actorOf(id, roles), fullName });
const owner = () => named(ids.owner, ["owner"], "Faisal Rahman");
const strategist = () => named(ids.strategist, ["strategist"], "Anjali Nair");
const designer = () => named(ids.designer, ["designer"], "Nikhil Das");
const marketer = () => named(ids.marketer, ["performance_marketer"], "Rahul Krishnan");
const intern = () => named(ids.intern, ["intern"], "Arun Babu");
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? "ok" : r.error!.code);
function value<T>(r: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}
async function boardWithSticky(who: ReturnType<typeof owner>, clientId: string, text = "Run a parent webinar") {
  const b = sceneBuilder(() => newId());
  const sticky = b.sticky(text, 0, 0);
  const { id } = value(await boards.create(who, { clientId, title: "Ideas", elements: b.elements }));
  return { boardId: id, stickyId: sticky.id };
}

beforeEach(async () => {
  await wipe(db);
  metaToken = false;
  ids.owner = await addPerson(db, "Faisal Rahman", ["owner"]);
  ids.strategist = await addPerson(db, "Anjali Nair", ["strategist"]);
  ids.designer = await addPerson(db, "Nikhil Das", ["designer"]);
  ids.marketer = await addPerson(db, "Rahul Krishnan", ["performance_marketer"]);
  ids.intern = await addPerson(db, "Arun Babu", ["intern"]);
  ids.zenith = await addClient(db, "Zenith IAS Academy", { strategistId: ids.strategist, members: [ids.designer] });
  ids.other = await addClient(db, "Brightpath Nursing", { strategistId: ids.strategist });
  ids.founder = newId();
  await db.insert(s.clients).values({ id: ids.founder, name: "Founder office", isInternal: true, isPrivate: true, status: "active" });
  await db.insert(s.clientMembers).values([
    { clientId: ids.founder, personId: ids.designer, level: "edit" },
    { clientId: ids.founder, personId: ids.marketer, level: "view" },
  ]);
  [ids.project, ids.founderProject, ids.otherProject] = [newId(), newId(), newId()];
  await db.insert(s.projects).values([
    { id: ids.project, clientId: ids.zenith, name: "NEET 2027" },
    { id: ids.founderProject, clientId: ids.founder, name: "Hiring" },
    { id: ids.otherProject, clientId: ids.other, name: "Nursing intake" },
  ]);
});

afterAll(async () => {
  await store.close();
  await client.end();
  await storage.close();
});

describe("sticky → task", () => {
  it("makes the task through the task service, links the sticky once, and records it", async () => {
    const { boardId, stickyId } = await boardWithSticky(strategist(), ids.zenith);
    const { taskId } = value(await boards.stickyToTask(strategist(), { boardId, elementId: stickyId, projectId: ids.project, ownerId: ids.designer, dueDate: "2026-10-30" }));
    const t = value(await tasks.get(designer(), taskId));
    expect([t.title, t.ownerName, t.dueDate, t.description]).toEqual(["Run a parent webinar", "Nikhil Das", "2026-10-30", "From the idea board “Ideas”."]);
    expect(value(await boards.open(strategist(), boardId)).taskLinks).toEqual([{ elementId: stickyId, taskId }]);
    expect(code(await boards.stickyToTask(strategist(), { boardId, elementId: stickyId, projectId: ids.project }))).toBe("invalid");
    const ev = await db.execute<{ action: string }>(sql`select action from events where action in ('task.created', 'board.sticky_to_task') order by occurred_at`);
    expect(ev.map((e) => e.action)).toEqual(["task.created", "board.sticky_to_task"]);
  });

  it("refuses without edit level, another client's project, and an owner outside a private space", async () => {
    const z = await boardWithSticky(strategist(), ids.zenith);
    expect(code(await boards.stickyToTask(designer(), { boardId: z.boardId, elementId: z.stickyId, projectId: ids.otherProject }))).toBe("invalid");
    expect(code(await boards.stickyToTask(strategist(), { boardId: z.boardId, elementId: "nope", projectId: ids.project }))).toBe("not_found");
    const f = await boardWithSticky(designer(), ids.founder, "Hire a video editor");
    expect(code(await boards.stickyToTask(marketer(), { boardId: f.boardId, elementId: f.stickyId, projectId: ids.founderProject }))).toBe("forbidden");
    // The task service's own guard: the owner isn't in the private space.
    const outside = await boards.stickyToTask(designer(), { boardId: f.boardId, elementId: f.stickyId, projectId: ids.founderProject, ownerId: ids.strategist });
    expect(outside.ok ? "" : outside.error.message).toMatch(/Add them to the space first/);
    expect(code(await boards.stickyToTask(designer(), { boardId: f.boardId, elementId: f.stickyId, projectId: ids.founderProject, ownerId: ids.designer }))).toBe("ok");
  });
});

describe("live cards", () => {
  it("show what the viewer may see and 'No access' (never the title) otherwise, private spaces included", async () => {
    const { boardId, stickyId } = await boardWithSticky(strategist(), ids.zenith);
    const { taskId } = value(await boards.stickyToTask(strategist(), { boardId, elementId: stickyId, projectId: ids.project, ownerId: ids.designer }));
    const card = await cards.card(designer(), "task", taskId);
    expect(card).toMatchObject({ state: "ok", kind: "task", title: "Run a parent webinar", status: "todo", href: `/tasks/${taskId}` });
    expect(await cards.card(intern(), "task", taskId)).toEqual({ state: "no_access" });

    const docId = newId();
    await db.insert(s.docs).values({ id: docId, title: "Founder hiring plan", body: "Secret salaries", clientId: ids.founder, position: 0 });
    expect(await cards.card(designer(), "doc", docId)).toMatchObject({ state: "ok", title: "Founder hiring plan" });
    expect(await cards.card(strategist(), "doc", docId)).toEqual({ state: "no_access" });
    expect(await cards.card(owner(), "knowledge", ids.zenith)).toMatchObject({ state: "ok", clientName: "Zenith IAS Academy" });
    expect(await cards.card(owner(), "knowledge", ids.founder)).toMatchObject({ state: "ok", clientName: "Founder office" });
    expect(await cards.card(strategist(), "knowledge", ids.founder)).toEqual({ state: "no_access" });
    expect(await cards.card(owner(), "results", ids.zenith)).toMatchObject({ state: "ok", kind: "results", clientName: "Zenith IAS Academy" });
    expect(await cards.card(designer(), "results", ids.zenith)).toEqual({ state: "no_access" }); // results aren't a designer's to read
    expect(await cards.card(owner(), "creative", newId())).toEqual({ state: "no_access" });
    expect(await cards.card(owner(), "task", "not-an-id")).toEqual({ state: "no_access" });
  });
});

describe("swipe file", () => {
  it("saves links with previews, YouTube and Meta embeds (or the fallback), and adds them to boards", async () => {
    const { boardId } = await boardWithSticky(strategist(), ids.zenith);
    const { id: page } = value(await swipe.saveLink(designer(), { clientId: ids.zenith, url: "https://zenith.example/webinar", notes: "good hook", tags: ["Hook", "neet", "hook"], boardId }));
    const p = (await swipe.get(strategist(), page))!;
    expect([p.kind, p.title, p.description, p.imageUrl, p.site, p.tags]).toEqual(["link", "Parent webinar", "Join us", "https://zenith.example/cover.jpg", "zenith.example", ["hook", "neet"]]);
    const yt = (await swipe.get(designer(), value(await swipe.saveLink(designer(), { clientId: ids.zenith, url: "https://youtu.be/dQw4w9WgXcQ" })).id))!;
    expect([yt.kind, yt.title, yt.embedUrl]).toEqual(["youtube", "NEET topper interview", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"]);
    const ig = (await swipe.get(designer(), value(await swipe.saveLink(designer(), { clientId: ids.zenith, url: "https://www.instagram.com/reel/Cx1abc/" })).id))!;
    expect([ig.kind, ig.title, ig.embedHtml]).toEqual(["instagram", "Instagram post", null]); // no oEmbed access: "Open on Instagram"
    metaToken = true;
    const ig2 = (await swipe.get(designer(), value(await swipe.saveLink(designer(), { clientId: ids.zenith, url: "https://www.instagram.com/reel/Cx2abc/" })).id))!;
    expect([ig2.title, ig2.embedHtml?.includes("instagram-media")]).toEqual(["Reel", true]);
    expect(code(await swipe.saveLink(designer(), { clientId: ids.zenith, url: "http://192.168.1.1/admin" }))).toBe("invalid");
    expect(code(await swipe.saveLink(designer(), { clientId: ids.zenith, url: "https://zenith.example/missing" }))).toBe("ok"); // saved with its address as the title
    // The first link went onto the board as a live card.
    const scene = value(await boards.open(strategist(), boardId)).scene.elements as Array<{ type: string; link?: string }>;
    expect(scene.filter((e) => e.type === "embeddable").map((e) => e.link)).toEqual([cardUrl("ref", page)]);
    expect(await cards.card(designer(), "ref", page)).toMatchObject({ state: "ok", kind: "ref", item: { title: "Parent webinar" } });
  });

  it("searches only clients the viewer sees; private spaces stay private; filters by tag, type and who saved", async () => {
    value(await swipe.saveLink(designer(), { clientId: ids.zenith, url: "https://zenith.example/webinar", tags: ["hook"] }));
    const secret = value(await swipe.saveLink(designer(), { clientId: ids.founder, url: "https://youtu.be/dQw4w9WgXcQ", notes: "hiring idea", tags: ["hiring"] })).id;
    value(await swipe.saveLink(strategist(), { clientId: ids.other, url: "https://youtu.be/dQw4w9WgXcQ", tags: ["nursing"] }));
    const titles = async (who: ReturnType<typeof owner>, f = {}) => value(await swipe.search(who, f)).items.map((i) => `${i.clientName}: ${i.title}`).sort();
    expect(await titles(strategist())).toEqual(["Brightpath Nursing: NEET topper interview", "Zenith IAS Academy: Parent webinar"]);
    expect(await titles(designer())).toEqual(["Founder office: NEET topper interview", "Zenith IAS Academy: Parent webinar"]); // designers see their clients only
    expect(await titles(strategist(), { q: "hiring" })).toEqual([]);
    expect(await titles(owner(), { q: "hiring" })).toEqual(["Founder office: NEET topper interview"]);
    expect(await titles(owner(), { tag: "nursing" })).toEqual(["Brightpath Nursing: NEET topper interview"]);
    expect(await titles(owner(), { kind: "link" })).toEqual(["Zenith IAS Academy: Parent webinar"]);
    expect(await titles(owner(), { savedBy: ids.strategist })).toEqual(["Brightpath Nursing: NEET topper interview"]);
    expect(value(await swipe.search(strategist())).tags).not.toContain("hiring");
    expect(await swipe.get(strategist(), secret)).toBeNull();
    expect(await cards.card(strategist(), "ref", secret)).toEqual({ state: "no_access" });
    expect(code(await swipe.saveLink(marketer(), { clientId: ids.founder, url: "https://zenith.example/webinar" }))).toBe("forbidden"); // view level
    expect(code(await swipe.edit(strategist(), { id: secret, title: "x", notes: "", tags: [] }))).toBe("not_found");
    expect(code(await swipe.remove(marketer(), secret))).toBe("forbidden");
    expect(code(await swipe.remove(designer(), secret))).toBe("ok");
  });

  it("takes screenshots; videos only when files are in Google Drive", async () => {
    const png = { name: "hook.png", contentType: "image/png", bytes: new Uint8Array([137, 80, 78, 71]) };
    const mp4 = { name: "ad.mp4", contentType: "video/mp4", bytes: new Uint8Array(1000) };
    const shot = value(await swipe.saveFile(designer(), { clientId: ids.zenith, tags: ["hook"] }, png)).id;
    expect((await swipe.get(designer(), shot))!.fileUrl).toBe(`/api/swipe/${shot}/file`);
    const refused = await swipe.saveFile(designer(), { clientId: ids.zenith }, mp4);
    expect(refused.ok ? "" : refused.error.message).toMatch(/Videos need files kept in Google Drive/);
    const drive = { ...storage, provider: "google_drive" as const, upload: storage.upload.bind(storage), read: storage.read.bind(storage) } as unknown as FileStorage;
    expect(code(await swipeWith(drive).saveFile(designer(), { clientId: ids.zenith }, mp4))).toBe("ok");
    expect(code(await swipe.saveFile(designer(), { clientId: ids.zenith }, { ...png, contentType: "application/pdf" }))).toBe("invalid");
  });
});

describe("share to Oppllo", () => {
  it("keeps what a phone shared for its owner only, then files it where they say", async () => {
    const { id } = value(await swipe.receiveShare(designer(), { title: "Look", text: "Great reel https://youtu.be/dQw4w9WgXcQ via app" }));
    expect((await swipe.share(designer(), id))?.url).toBe("https://youtu.be/dQw4w9WgXcQ");
    expect(await swipe.share(strategist(), id)).toBeNull();
    expect(code(await swipe.useShare(strategist(), { shareId: id, clientId: ids.zenith }))).toBe("not_found");
    const { boardId } = await boardWithSticky(designer(), ids.founder);
    const used = value(await swipe.useShare(designer(), { shareId: id, clientId: ids.founder, boardId, tags: ["trend"] }));
    expect((await swipe.get(designer(), used.id))!.tags).toEqual(["trend"]);
    expect(await swipe.share(designer(), id)).toBeNull(); // used once
    for (const bad of [{ url: "javascript:alert(1)" }, { text: "no link here" }, { url: "x".repeat(2001) }]) expect(code(await swipe.receiveShare(designer(), bad)), JSON.stringify(bad).slice(0, 40)).toBe("invalid");
    expect(code(await swipe.receiveShare(designer(), {}, { name: "a.svg", contentType: "image/svg+xml", bytes: new Uint8Array(3) }))).toBe("invalid");
  });
});

describe("board → Docs page (13.1b)", () => {
  it("makes the page in the board's client or space, with the docs service's own checks", async () => {
    const { boardId } = await boardWithSticky(strategist(), ids.zenith);
    const { id } = value(await boards.toDocsPage(strategist(), { boardId, title: "Campaign ideas", markdown: "- Hook\n  - Parents" }));
    const [doc] = await db.execute<{ client_id: string; body: string }>(sql`select client_id, body from docs where id = ${id}`);
    expect(doc!.client_id).toBe(ids.zenith);
    expect(doc!.body).toContain("- Hook\n  - Parents");
    const f = await boardWithSticky(designer(), ids.founder);
    expect(code(await boards.toDocsPage(designer(), { boardId: f.boardId, title: "Hiring", markdown: "- a" }))).toBe("ok");
    expect(code(await boards.toDocsPage(marketer(), { boardId: f.boardId, title: "Hiring", markdown: "- a" }))).toBe("forbidden"); // view level
    expect(code(await boards.toDocsPage(strategist(), { boardId: f.boardId, title: "Hiring", markdown: "- a" }))).toBe("not_found"); // private space
    expect(code(await boards.toDocsPage(strategist(), { boardId, title: "", markdown: "- a" }))).toBe("invalid");
  });
});
