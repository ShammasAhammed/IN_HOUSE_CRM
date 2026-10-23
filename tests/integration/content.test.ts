// The content calendar (Stage 7.3, D81).
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPostgresStorage } from "@/adapters/postgres";
import * as s from "@/db/schema";
import { createAssetService } from "@/services/assets";
import { createContentService } from "@/services/content";
import { createTaskService } from "@/services/tasks";
import { actorOf, addClient, addPerson, addProjectWithTask, eventsFor, fixedClock, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const storage = createPostgresStorage(process.env.DATABASE_URL_TEST!, { signLink: ({ fileId }) => `/files/${fileId}` });
const clock = fixedClock("2026-10-14");
const content = createContentService({ store, clock });
const assets = createAssetService({ store, storage, clock });
const ids = {} as Record<"strategist" | "social" | "editor" | "bdo" | "client" | "task" | "asset", string>;
const strategist = () => actorOf(ids.strategist, ["strategist"]);
const social = () => actorOf(ids.social, ["social_media"]);

const item = (extra: Record<string, string> = {}) => ({ clientId: ids.client, title: "Diwali offer", channel: "instagram_post", publishOn: "2026-10-20", publishTime: "18:30", ...extra });

beforeEach(async () => {
  await wipe(db);
  ids.strategist = await addPerson(db, "Anjali Nair", ["strategist"]);
  ids.social = await addPerson(db, "Fathima Sherin", ["social_media"]);
  ids.editor = await addPerson(db, "Nikhil Thomas", ["video_editor"]);
  ids.bdo = await addPerson(db, "Muhammed Ajmal", ["bdo"]);
  ids.client = await addClient(db, "Zenith IAS Academy", { members: [ids.social] });
  ids.task = (await addProjectWithTask(db, ids.client, { ownerId: ids.social })).taskId;
  const a = await assets.create(social(), { clientId: ids.client, taskId: ids.task, title: "Diwali post", link: "https://www.canva.com/design/x/view", submit: "on" }, null);
  if (!a.ok) throw new Error(JSON.stringify(a.error));
  ids.asset = a.value.id;
});

afterAll(async () => {
  await Promise.all([store.close(), storage.close(), client.end()]);
});

describe("the calendar", () => {
  it("is planned by the client's team and seen only by people who see its creatives", async () => {
    const r = await content.create(social(), item({ assetId: ids.asset }));
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    const month = await content.month(social(), ids.client, "2026-10");
    expect(month.ok && month.value.items.map((i) => [i.title, i.publishTime, i.status, i.assetTitle, i.assetState])).toEqual([["Diwali offer", "18:30", "idea", "Diwali post", "internal_review"]]);
    expect((await eventsFor(db, r.value.id)).map((e) => e.action)).toEqual(["content.created"]);
    for (const actor of [actorOf(ids.editor, ["video_editor"]), actorOf(ids.bdo, ["bdo"])]) {
      const peek = await content.month(actor, ids.client, "2026-10");
      expect(peek.ok ? "ok" : peek.error.code).not.toBe("ok");
    }
    const bad = await content.create(social(), item({ publishTime: "25:00", channel: "fax" }));
    expect(!bad.ok && Object.keys(bad.error.fieldErrors ?? {}).sort()).toEqual(["channel", "publishTime"]);
  });

  it("schedules only approved work, and approving the creative makes the item ready", async () => {
    const r = await content.create(social(), item({ assetId: ids.asset, status: "in_production" }));
    if (!r.ok) throw new Error("create");
    const early = await content.update(social(), { itemId: r.value.id, ...item({ assetId: ids.asset, status: "scheduled" }) });
    expect(!early.ok && early.error.fieldErrors?.status).toBeDefined();
    // With no creative at all, scheduled and published are refused too (test report M8).
    const none = await content.update(social(), { itemId: r.value.id, ...item({ status: "scheduled" }) });
    expect(!none.ok && none.error.fieldErrors?.assetId).toBeDefined();
    expect((await content.create(social(), item({ status: "published" }))).ok).toBe(false);
    const [v] = await store.assets.listVersions(ids.asset);
    await assets.review(strategist(), { assetId: ids.asset, versionId: v!.id, action: "send_to_client" });
    expect((await assets.review(strategist(), { assetId: ids.asset, versionId: v!.id, action: "client_approved", note: "OK" })).ok).toBe(true);
    const [row] = await db.select({ status: s.contentItems.status }).from(s.contentItems).where(sql`${s.contentItems.id} = ${r.value.id}`);
    expect(row!.status).toBe("ready");
    expect((await eventsFor(db, r.value.id)).map((e) => e.action)).toEqual(["content.created", "content.ready"]);
    // Published needs the link, when editing and when creating (QA S4-B1).
    const noLink = await content.update(social(), { itemId: r.value.id, ...item({ assetId: ids.asset, status: "published" }) });
    expect(!noLink.ok && noLink.error.fieldErrors?.publishedUrl).toEqual(["Paste the link to the published post."]);
    const newNoLink = await content.create(social(), item({ assetId: ids.asset, status: "published" }));
    expect(!newNoLink.ok && newNoLink.error.fieldErrors?.publishedUrl).toEqual(["Paste the link to the published post."]);
    expect((await content.update(social(), { itemId: r.value.id, ...item({ assetId: ids.asset, status: "published", publishedUrl: "https://instagram.com/p/x" }) })).ok).toBe(true);
  });

  it("refuses another client's creative, and removes softly", async () => {
    const other = await addClient(db, "Other", { members: [ids.social] });
    const wrong = await content.create(social(), item({ clientId: other, assetId: ids.asset }));
    expect(!wrong.ok && wrong.error.fieldErrors?.assetId).toBeDefined();
    const r = await content.create(social(), item());
    if (!r.ok) throw new Error("create");
    expect((await content.remove(social(), { itemId: r.value.id })).ok).toBe(true);
    const month = await content.month(social(), ids.client, "2026-10");
    expect(month.ok && month.value.items).toEqual([]);
  });

  it("shows time, the creative's review and the calendar post in the task's Activity (QA S8-B2)", async () => {
    const tasks = createTaskService({ store, clock });
    expect((await tasks.logTime(social(), { taskId: ids.task, minutes: 60 })).ok).toBe(true);
    const [v] = await store.assets.listVersions(ids.asset);
    await assets.review(strategist(), { assetId: ids.asset, versionId: v!.id, action: "send_to_client" });
    expect((await assets.review(strategist(), { assetId: ids.asset, versionId: v!.id, action: "client_approved", note: "TEST Principal on WhatsApp" })).ok).toBe(true);
    expect((await content.create(social(), item({ assetId: ids.asset, status: "scheduled", title: "TEST Diwali post" }))).ok).toBe(true);
    const r = await tasks.activity(strategist(), ids.task, { day: (d) => d });
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.map((a) => `${a.who} ${a.text}`)).toEqual([
      "Fathima Sherin put “TEST Diwali post” on the content calendar",
      "Anjali Nair recorded the client's approval of “Diwali post”: “TEST Principal on WhatsApp”",
      "Anjali Nair sent “Diwali post” to the client",
      "Fathima Sherin logged 1h for 2026-10-14",
      "Fathima Sherin added the creative “Diwali post”",
    ]);
  });
});

