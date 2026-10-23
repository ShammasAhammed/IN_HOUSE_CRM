// Creatives and their review (Stage 7.2, D80).
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPostgresStorage } from "@/adapters/postgres";
import * as s from "@/db/schema";
import { createAssetService } from "@/services/assets";
import { actorOf, addClient, addPerson, addProjectWithTask, eventsFor, fixedClock, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const storage = createPostgresStorage(process.env.DATABASE_URL_TEST!, { signLink: ({ fileId }, _exp, name, viewerId) => `/files/${fileId}?name=${name}&viewer=${viewerId}` });
const svc = createAssetService({ store, storage, clock: fixedClock("2026-10-14") });
const ids = {} as Record<"owner" | "strategist" | "designer" | "editor" | "intern" | "bdo" | "client" | "internal" | "task" | "internTask" | "internalTask", string>;
const strategist = () => actorOf(ids.strategist, ["strategist"]);
const designer = () => actorOf(ids.designer, ["designer"]);
const intern = () => actorOf(ids.intern, ["intern"]);

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const png = (name = "Reel cover.png") => ({ name, bytes: PNG });

async function make(extra: Record<string, string> = {}, file: { name: string; bytes: Uint8Array } | null = png(), actor = designer()) {
  const r = await svc.create(actor, { clientId: ids.client, taskId: ids.task, title: "Diwali offer post", submit: "on", ...extra }, file);
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value.id;
}

/** A review step on the newest version, as the review panel sends it. */
const step = async (actor: ReturnType<typeof actorOf>, assetId: string, action: string, note?: string) => {
  const [current] = await store.assets.listVersions(assetId);
  return svc.review(actor, { assetId, versionId: current!.id, action, ...(note ? { note } : {}) });
};
const state = async (id: string) => (await db.select({ s: s.assets.approvalState, v: s.assets.currentVersion, a: s.assets.approvedVersionId }).from(s.assets).where(sql`${s.assets.id} = ${id}`))[0]!;

beforeEach(async () => {
  await wipe(db);
  ids.owner = await addPerson(db, "Faisal Rahman", ["owner"]);
  ids.strategist = await addPerson(db, "Anjali Nair", ["strategist"]);
  ids.designer = await addPerson(db, "Vishnu Prasad", ["designer"]);
  ids.editor = await addPerson(db, "Nikhil Thomas", ["video_editor"]);
  ids.intern = await addPerson(db, "Hiba Nasrin", ["intern"]);
  ids.bdo = await addPerson(db, "Muhammed Ajmal", ["bdo"]);
  ids.client = await addClient(db, "Zenith IAS Academy", { members: [ids.designer] });
  ids.task = (await addProjectWithTask(db, ids.client, { ownerId: ids.designer })).taskId;
  ids.internTask = (await addProjectWithTask(db, ids.client, { ownerId: ids.intern })).taskId;
  ids.internal = await addClient(db, "Oppllo Digital");
  await db.update(s.clients).set({ isInternal: true }).where(sql`${s.clients.id} = ${ids.internal}`);
  ids.internalTask = (await addProjectWithTask(db, ids.internal, { ownerId: ids.designer })).taskId;
});

afterAll(async () => {
  await Promise.all([store.close(), storage.close(), client.end()]);
});

describe("making a creative", () => {
  it("stores the file under the client, takes client and project from the task, and sends it for review", async () => {
    const id = await make();
    const [a] = await db.select().from(s.assets);
    expect(a).toMatchObject({ id, clientId: ids.client, taskId: ids.task, kind: "image", approvalState: "internal_review", currentVersion: 1, createdById: ids.designer });
    const [file] = await db.select({ folder: s.storedFiles.folder, type: s.storedFiles.contentType }).from(s.storedFiles);
    expect(file).toEqual({ folder: `clients/${ids.client}/assets/${id}`, type: "image/png" });
    const page = await svc.page(designer(), id);
    if (!page.ok) throw new Error(page.error.message);
    expect(page.value.versions.map((v) => [v.version, v.fileName, v.link?.startsWith("/files/"), v.comments.map((c) => c.action)])).toEqual([[1, "Reel cover.png", true, ["submit"]]]);
    expect((await eventsFor(db, id)).map((e) => e.action)).toEqual(["asset.created"]);
  });

  it("takes a link instead of a file (videos, big files), but not both or neither, and checks files by their bytes", async () => {
    const link = await make({ link: "https://drive.google.com/file/d/abc/view", kind: "video" }, null);
    const page = await svc.page(designer(), link);
    expect(page.ok && page.value.versions[0]).toMatchObject({ isLink: true, link: "https://drive.google.com/file/d/abc/view", fileName: "drive.google.com/file/d/abc/view" });
    expect(page.ok && page.value.asset.kind).toBe("video");
    const both = await svc.create(designer(), { clientId: ids.client, taskId: ids.task, title: "x y", link: "https://example.com/a" }, png());
    expect(!both.ok && both.error.fieldErrors?.link).toBeDefined();
    const neither = await svc.create(designer(), { clientId: ids.client, taskId: ids.task, title: "x y" }, null);
    expect(!neither.ok && neither.error.fieldErrors?.file).toBeDefined();
    const html = await svc.create(designer(), { clientId: ids.client, taskId: ids.task, title: "x y" }, { name: "post.png", bytes: new TextEncoder().encode("<svg onload=alert(1)>") });
    expect(!html.ok && html.error.fieldErrors?.file).toBeDefined();
    const http = await svc.create(designer(), { clientId: ids.client, taskId: ids.task, title: "x y", link: "http://example.com/a" }, null);
    expect(!http.ok && http.error.fieldErrors?.link).toEqual(["Paste a link starting with https://"]);
  });
});

describe("who sees and does what", () => {
  it("shows creatives to their client's team, strategists and the owner; interns their own tasks'; never the BDO", async () => {
    const id = await make();
    const internId = await make({ taskId: ids.internTask }, png(), intern());
    const seen = async (actor: ReturnType<typeof actorOf>) => {
      const r = await svc.list(actor, { state: "all" });
      return r.ok ? r.value.assets.map((a) => a.id).sort() : r.error.code;
    };
    expect(await seen(strategist())).toEqual([id, internId].sort());
    expect(await seen(designer())).toEqual([id, internId].sort());
    expect(await seen(actorOf(ids.editor, ["video_editor"]))).toEqual([]);
    expect(await seen(intern())).toEqual([internId]);
    expect(await seen(actorOf(ids.bdo, ["bdo"]))).toEqual([]);
    const peek = await svc.page(actorOf(ids.editor, ["video_editor"]), id);
    expect(peek.ok ? "ok" : peek.error.code).toBe("not_found");
  });

  it("lets interns add creatives only to their own tasks, and only reviewers review", async () => {
    const noTask = await svc.create(intern(), { clientId: ids.client, title: "Poster" }, png());
    expect(noTask.ok ? "ok" : noTask.error.code).toBe("forbidden");
    const notTheirs = await svc.create(intern(), { clientId: ids.client, taskId: ids.task, title: "Poster" }, png());
    expect(notTheirs.ok ? "ok" : notTheirs.error.code).toBe("not_found");
    const id = await make();
    const own = await step(designer(), id, "send_to_client");
    expect(own.ok ? "ok" : own.error.code).toBe("forbidden");
  });
});

describe("the review", () => {
  it("goes to the client and back with changes, then a new version is approved and stays the approved one", async () => {
    const id = await make();
    expect((await step(strategist(), id, "send_to_client")).ok).toBe(true);
    const wrong = await step(strategist(), id, "request_changes", "x");
    expect(wrong.ok ? "ok" : wrong.error.code).toBe("conflict");
    const noNote = await step(strategist(), id, "client_changes");
    expect(!noNote.ok && noNote.error.fieldErrors?.note).toBeDefined();
    expect((await step(strategist(), id, "client_changes", "Logo bigger, date in Malayalam")).ok).toBe(true);
    expect(await state(id)).toMatchObject({ s: "changes_requested", v: 1, a: null });

    expect((await svc.addVersion(designer(), { assetId: id, link: "https://www.canva.com/design/abc/view", note: "Bigger logo", submit: "on" }, null)).ok).toBe(true);
    expect(await state(id)).toMatchObject({ s: "internal_review", v: 2 });
    await step(strategist(), id, "send_to_client");
    // The client's approval needs who and where (test report L14), so a stray double-click can't record it either.
    expect(await step(strategist(), id, "client_approved", "")).toMatchObject({ ok: false, error: { message: "Say who approved it, and where." } });
    expect((await step(strategist(), id, "client_approved", "Principal OK on WhatsApp")).ok).toBe(true);
    const v2 = (await store.assets.listVersions(id))[0]!;
    expect(await state(id)).toMatchObject({ s: "approved", v: 2, a: v2.id });

    // A third version waits as a draft; version 2 is still the one to publish.
    expect((await svc.addVersion(designer(), { assetId: id, link: "https://www.canva.com/design/abc2/view" }, null)).ok).toBe(true);
    expect(await state(id)).toMatchObject({ s: "draft", v: 3, a: v2.id });
    const page = await svc.page(strategist(), id);
    if (!page.ok) throw new Error(page.error.message);
    expect(page.value.versions.map((v) => [v.version, v.isApproved])).toEqual([
      [3, false],
      [2, true],
      [1, false],
    ]);
    expect(page.value.versions[1]!.comments.map((c) => [c.action, c.body])).toEqual([
      ["submit", ""],
      ["send_to_client", ""],
      ["client_approved", "Principal OK on WhatsApp"],
    ]);
    // A draft waits on its makers (strategists can make too); nothing to review until it's sent.
    expect(page.value.actions).toEqual(["submit"]);
    const forBdo = await svc.page(actorOf(ids.bdo, ["bdo"]), id);
    expect(forBdo.ok ? "ok" : forBdo.error.code).toBe("not_found");
    expect((await eventsFor(db, id)).map((e) => e.action)).toEqual([
      "asset.created",
      "asset.send_to_client",
      "asset.client_changes",
      "asset.version_added",
      "asset.send_to_client",
      "asset.client_approved",
      "asset.version_added",
    ]);
  });

  it("approves Oppllo's own work at the internal review, with no client step", async () => {
    const id = await make({ clientId: ids.internal, taskId: ids.internalTask });
    const toClient = await step(strategist(), id, "send_to_client");
    expect(toClient.ok ? "ok" : toClient.error.code).toBe("conflict");
    expect((await step(strategist(), id, "approve")).ok).toBe(true);
    expect((await state(id)).s).toBe("approved");
  });

  it("refuses a step on a version the reviewer didn't see", async () => {
    const id = await make();
    const [v1] = await store.assets.listVersions(id);
    await svc.addVersion(designer(), { assetId: id, link: "https://www.canva.com/design/v2/view", submit: "on" }, null);
    const stale = await svc.review(strategist(), { assetId: id, versionId: v1!.id, action: "send_to_client" });
    expect(!stale.ok && stale.error.code).toBe("conflict");
  });

  it("gives the BDO no creatives even on a task they own", async () => {
    const bdoTask = (await addProjectWithTask(db, ids.client, { ownerId: ids.bdo })).taskId;
    const r = await svc.create(actorOf(ids.bdo, ["bdo"]), { clientId: ids.client, taskId: bdoTask, title: "Flyer" }, png());
    expect(r.ok ? "ok" : r.error.code).not.toBe("ok");
  });

  it("counts what waits on a reviewer", async () => {
    await make();
    const sent = await make();
    await step(strategist(), sent, "send_to_client");
    expect(await svc.waitingForReview(strategist())).toEqual({ review: 1, withClient: 1 });
    expect(await svc.waitingForReview(designer())).toEqual({ review: 0, withClient: 0 });
  });
});

describe("comments", () => {
  it("attach to a version, at a moment for video", async () => {
    const id = await make({ link: "https://drive.google.com/file/d/vid/view", kind: "video" }, null);
    const [v1] = await store.assets.listVersions(id);
    expect((await svc.comment(strategist(), { assetId: id, versionId: v1!.id, body: "Cut the pause here", at: "1:05" })).ok).toBe(true);
    const bad = await svc.comment(strategist(), { assetId: id, versionId: v1!.id, body: "x", at: "1:75" });
    expect(!bad.ok && bad.error.fieldErrors?.at).toEqual(["Write the moment like 1:05."]);
    const other = await make();
    const [otherV] = await store.assets.listVersions(other);
    const wrongVersion = await svc.comment(strategist(), { assetId: id, versionId: otherV!.id, body: "x" });
    expect(wrongVersion.ok ? "ok" : wrongVersion.error.code).toBe("not_found");
    const page = await svc.page(designer(), id);
    expect(page.ok && page.value.versions[0]!.comments.filter((c) => !c.action).map((c) => [c.authorName, c.body, c.atSeconds])).toEqual([["Anjali Nair", "Cut the pause here", 65]]);
  });
});
