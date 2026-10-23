// Client knowledge base (Stage 11.2): who reads and keeps it, stale saves, campaigns, files and links, and search.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPostgresStorage } from "@/adapters/postgres";
import { createDocService } from "@/services/docs";
import { createKnowledgeService } from "@/services/knowledge";
import { actorOf, addClient, addPerson, addProjectWithTask, eventsFor, fixedClock, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const storage = createPostgresStorage(process.env.DATABASE_URL_TEST!, {
  signLink: ({ fileId }, expiresAt, name, viewerId) => `/api/files/${fileId}?exp=${expiresAt.getTime()}&name=${name}&viewer=${viewerId}`,
});
const clock = fixedClock("2026-10-18");
const kb = createKnowledgeService({ store, clock, storage });
const docs = createDocService({ store, clock });
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
let strategist = "";
let designer = "";
let intern = "";
let accountant = "";
let zenith = "";
let alpha = "";
const s = () => actorOf(strategist, ["strategist"]);
const d = () => actorOf(designer, ["designer"]);

beforeEach(async () => {
  await wipe(db);
  strategist = await addPerson(db, "Anjali Nair", ["strategist"]);
  designer = await addPerson(db, "Nikhil Das", ["designer"]);
  intern = await addPerson(db, "Rahul K", ["intern"]);
  accountant = await addPerson(db, "Lekha Menon", ["accountant"]);
  zenith = await addClient(db, "Zenith IAS Academy", { members: [designer] });
  alpha = await addClient(db, "Alpha Nursing College");
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("tone of voice and do's and don'ts", () => {
  it("are kept by strategists, read by the client's team, and refused from a stale page", async () => {
    expect((await kb.save(s(), { clientId: zenith, version: "0", tone: "Warm, confident, Malayalam first", dos: "- Show toppers", donts: "- No fee talk" })).ok).toBe(true);
    const read = await kb.forClient(d(), zenith);
    expect(read.ok && read.value).toMatchObject({ knowledge: { tone: "Warm, confident, Malayalam first", version: 1, updatedByName: "Anjali Nair" }, canEdit: false });

    const designerSave = await kb.save(d(), { clientId: zenith, version: "1", tone: "x" });
    expect(designerSave.ok ? "ok" : designerSave.error.code).toBe("forbidden");
    // Designers only see their own clients.
    const other = await kb.forClient(d(), alpha);
    expect(other.ok ? "ok" : other.error.code).toBe("not_found");

    expect((await kb.save(s(), { clientId: zenith, version: "1", tone: "Warm", dos: "- Show toppers", donts: "- No fee talk" })).ok).toBe(true);
    const stale = await kb.save(s(), { clientId: zenith, version: "1", tone: "Formal" });
    expect(stale.ok ? "ok" : stale.error.code).toBe("conflict");
    // Saving the same words again records nothing.
    expect((await kb.save(s(), { clientId: zenith, version: "2", tone: "Warm", dos: "- Show toppers", donts: "- No fee talk" })).ok).toBe(true);
    expect((await eventsFor(db, zenith)).filter((e) => e.action === "client.knowledge_saved")).toHaveLength(2);
    const tooLong = await kb.save(s(), { clientId: zenith, version: "2", tone: "x".repeat(2001) });
    expect(tooLong.ok ? null : tooLong.error.fieldErrors?.tone).toEqual(["Keep it under 2,000 characters."]);
  });

  it("are readable by an intern working on the client and by the accountant", async () => {
    await addProjectWithTask(db, zenith, { ownerId: intern });
    await kb.save(s(), { clientId: zenith, version: "0", tone: "Warm" });
    const i = await kb.forClient(actorOf(intern, ["intern"]), zenith);
    expect(i.ok && i.value.knowledge.tone).toBe("Warm");
    const a = await kb.forClient(actorOf(accountant, ["accountant"]), zenith);
    expect(a.ok && a.value.canEdit).toBe(false);
  });
});

describe("past campaigns, files and links", () => {
  it("add and remove campaigns with what worked", async () => {
    const bad = await kb.addCampaign(s(), { clientId: zenith, name: "", whatWorked: "" });
    expect(bad.ok ? null : Object.keys(bad.error.fieldErrors ?? {})).toEqual(["name", "whatWorked"]);
    const c = await kb.addCampaign(s(), { clientId: zenith, name: "Prelims 2026", period: "Apr–Jun 2026", whatWorked: "Topper reels; WhatsApp follow-up in 10 min", whatToAvoid: "" });
    expect(c.ok).toBe(true);
    const id = c.ok ? c.value.id : "";
    let r = await kb.forClient(d(), zenith);
    expect(r.ok && r.value.campaigns).toMatchObject([{ name: "Prelims 2026", period: "Apr–Jun 2026", whatToAvoid: null, createdByName: "Anjali Nair" }]);
    const no = await kb.removeCampaign(d(), id);
    expect(no.ok ? "ok" : no.error.code).toBe("forbidden");
    expect((await kb.removeCampaign(s(), id)).ok).toBe(true);
    r = await kb.forClient(d(), zenith);
    expect(r.ok && r.value.campaigns).toEqual([]);
    expect((await eventsFor(db, id)).map((e) => e.action)).toEqual(["client.campaign_added", "client.campaign_removed"]);
  });

  it("take brand kit files by their bytes and SOP links, open them only for people who see the client", async () => {
    const f = await kb.addFile(s(), { clientId: zenith, kind: "brand", title: "Logo" }, { name: "logo.png", bytes: png });
    expect(f.ok).toBe(true);
    const link = await kb.addFile(s(), { clientId: zenith, kind: "sop", link: "https://docs.google.com/document/d/abc" }, null);
    expect(link.ok).toBe(true);
    expect((await kb.addFile(s(), { clientId: zenith, kind: "brand" }, { name: "run.exe", bytes: new Uint8Array([0x4d, 0x5a, 0]) })).ok).toBe(false);
    expect((await kb.addFile(s(), { clientId: zenith, kind: "sop", link: "http://insecure.example" }, null)).ok).toBe(false);
    expect((await kb.addFile(s(), { clientId: zenith, kind: "sop" }, null)).ok).toBe(false);

    const r = await kb.forClient(d(), zenith);
    expect(r.ok && r.value.files.map((x) => [x.title, x.kind, x.isLink, x.host])).toEqual([
      ["docs.google.com/document/d/abc", "sop", true, "docs.google.com"],
      ["Logo", "brand", false, null],
    ]);
    const fileId = f.ok ? f.value.id : "";
    const open = await kb.fileLink(d(), fileId);
    expect(open.ok && open.value.url).toContain(`viewer=${designer}`);
    const outsider = await addPerson(db, "Sneha Joy", ["designer"]);
    const denied = await kb.fileLink(actorOf(outsider, ["designer"]), fileId);
    expect(denied.ok ? "ok" : denied.error.code).toBe("not_found");
    expect((await kb.removeFile(s(), fileId)).ok).toBe(true);
    expect((await kb.fileLink(d(), fileId)).ok).toBe(false);
  });

  it("list the client's own Docs pages", async () => {
    await docs.create(s(), { title: "Zenith posting SOP", body: "Post at 7 pm", clientId: zenith });
    await docs.create(s(), { title: "Team handbook", body: "" });
    const r = await kb.forClient(d(), zenith);
    expect(r.ok && r.value.docs.map((x) => x.title)).toEqual(["Zenith posting SOP"]);
  });
});

describe("search for the assistant", () => {
  it("finds matching clients within the asker's own clients", async () => {
    await kb.save(s(), { clientId: zenith, version: "0", tone: "Warm, Malayalam first", dos: "Show toppers" });
    await kb.addCampaign(s(), { clientId: zenith, name: "Prelims 2026", whatWorked: "Topper reels" });
    await kb.addCampaign(s(), { clientId: zenith, name: "Open day", whatWorked: "Campus walk video" });
    await kb.addCampaign(s(), { clientId: alpha, name: "BSc Nursing 2026", whatWorked: "Topper reels from alumni" });

    const reels = await kb.search(s(), "topper reels");
    expect(reels.map((m) => [m.clientName, m.campaigns.map((c) => c.name)])).toEqual([
      ["Alpha Nursing College", ["BSc Nursing 2026"]],
      ["Zenith IAS Academy", ["Prelims 2026"]],
    ]);
    // A client's name brings everything kept for it.
    expect((await kb.search(s(), "zenith"))[0]?.campaigns).toHaveLength(2);
    // The designer sees only Zenith.
    expect((await kb.search(d(), "topper reels")).map((m) => m.clientName)).toEqual(["Zenith IAS Academy"]);
    expect(await kb.search(s(), "nothing like this")).toEqual([]);
  });
});
