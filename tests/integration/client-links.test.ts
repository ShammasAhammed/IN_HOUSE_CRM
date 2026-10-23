// A client's sheets, Google files and artifacts (Stage 13.0), with a fake Google: visibility per client and space,
// "share it with…", the 15-minute cache, tab and range reads with the cap, the Media plan summary, the AI tool and
// its switch, the daily change notice, write-back to one tab only, artifact pages, and plain links without Google.
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPostgresStorage } from "@/adapters/postgres";
import * as s from "@/db/schema";
import { newId } from "@/lib/id";
import type { GoogleFiles, GoogleRead } from "@/repositories";
import { assistantTools } from "@/services/assistant";
import { createClientLinksService } from "@/services/client-links";
import { createClientService } from "@/services/clients";
import { actorOf, addClient, addPerson, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const storage = createPostgresStorage(process.env.DATABASE_URL_TEST!, { signLink: ({ fileId }) => `/api/files/${fileId}` });
let now = new Date("2026-10-21T06:30:00Z");
const clock = { today: () => now.toISOString().slice(0, 10), now: () => now };

type FakeFile = { title: string; shared: boolean; modified: string; by: string; tabs: string[]; named: Record<string, string[][]>; tabValues: Record<string, string[][]>; text?: string };
const files = new Map<string, FakeFile>();
const calls = { values: 0, writes: [] as Array<{ id: string; tab: string; rows: number }> };
const deny = { ok: false as const, reason: "not_shared" as const, message: "not shared" };
function fakeGoogle(connected = true): GoogleFiles {
  const get = (id: string) => files.get(id);
  const off = async (): Promise<GoogleRead<never>> => ({ ok: false, reason: "not_connected", message: "Google isn't connected yet, so Oppllo One can't read this file. The link still opens it." });
  if (!connected) return { connected: false, serviceAccountEmail: null, meta: off, sheet: off, values: off, text: off, writeTab: off };
  return {
    connected: true,
    serviceAccountEmail: "oppllo-one@oppllo.iam.gserviceaccount.com",
    meta: async (id) => (get(id)?.shared ? { ok: true, value: { title: get(id)!.title, mimeType: "x", modifiedTime: new Date(get(id)!.modified), modifiedBy: get(id)!.by } } : deny),
    sheet: async (id) => (get(id)?.shared ? { ok: true, value: { tabs: get(id)!.tabs.map((t) => ({ title: t, rows: 1000, cols: 26 })), namedRanges: Object.keys(get(id)!.named) } } : deny),
    values: async (id, range) => {
      calls.values++;
      const f = get(id);
      if (!f?.shared) return deny;
      if (f.named[range]) return { ok: true, value: f.named[range]! };
      const tab = /^'(.+)'!A(\d+):Z(\d+)$/.exec(range);
      if (tab) return { ok: true, value: (f.tabValues[tab[1]!.replace(/''/g, "'")] ?? []).slice(Number(tab[2]) - 1, Number(tab[3])) };
      return { ok: true, value: [["?"]] };
    },
    text: async (id) => (get(id)?.shared ? { ok: true, value: get(id)!.text ?? "" } : deny),
    writeTab: async (id, tab, rows) => {
      calls.writes.push({ id, tab, rows: rows.length });
      return { ok: true, value: null };
    },
  };
}
const build = (connected = true) => createClientLinksService({ store, clock, storage, google: fakeGoogle(connected) });

const ids = { owner: "", strategist: "", designer: "", marketer: "", zenith: "", founder: "" };
const named = (id: string, roles: Parameters<typeof actorOf>[1], fullName: string) => ({ ...actorOf(id, roles), fullName });
const strategist = () => named(ids.strategist, ["strategist"], "Anjali Nair");
const designer = () => named(ids.designer, ["designer"], "Nikhil Das");
const marketer = () => named(ids.marketer, ["performance_marketer"], "Rahul Krishnan");
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? "ok" : r.error!.code);
const SHEET = "https://docs.google.com/spreadsheets/d/1MEDIAplanZenith000/edit";
const idOf = (r: { ok: boolean; value?: { id: string }; error?: { message: string } }) => {
  if (!r.ok) throw new Error(r.error!.message);
  return r.value!.id;
};

beforeEach(async () => {
  await wipe(db);
  now = new Date("2026-10-21T06:30:00Z");
  files.clear();
  calls.values = 0;
  calls.writes = [];
  files.set("1MEDIAplanZenith000", {
    title: "Zenith media plan Oct",
    shared: true,
    modified: "2026-10-20T10:00:00Z",
    by: "Rahul Krishnan",
    tabs: ["Media plan", "Contacts"],
    named: { PlannedBudget: [["₹1,20,000"]] },
    tabValues: { "Media plan": Array.from({ length: 450 }, (_, i) => [`Row ${i + 1}`, "Meta", String(1000 + i)]), Contacts: [["Parent", "98470 12345"]] },
  });
  files.set("1NOTsharedSheet0000", { title: "Hidden", shared: false, modified: "2026-10-20T10:00:00Z", by: "x", tabs: [], named: {}, tabValues: {} });
  ids.owner = await addPerson(db, "Faisal Rahman", ["owner"]);
  ids.strategist = await addPerson(db, "Anjali Nair", ["strategist"]);
  ids.designer = await addPerson(db, "Nikhil Das", ["designer"]);
  ids.marketer = await addPerson(db, "Rahul Krishnan", ["performance_marketer"]);
  ids.zenith = await addClient(db, "Zenith IAS Academy", { strategistId: ids.strategist, members: [ids.designer] });
  ids.founder = newId();
  await db.insert(s.clients).values({ id: ids.founder, name: "Founder office", isInternal: true, isPrivate: true, status: "active" });
  await db.insert(s.clientMembers).values({ clientId: ids.founder, personId: ids.designer, level: "edit" });
});

afterAll(async () => {
  await store.close();
  await client.end();
  await storage.close();
});

describe("who sees and adds files", () => {
  it("follows the client or space: work roles add to clients, edit-level members to spaces, private spaces stay private", async () => {
    const links = build();
    const id = idOf(await links.add(marketer(), { clientId: ids.zenith, url: SHEET, kind: "media_plan" }));
    const page = await links.page(designer(), ids.zenith);
    expect(page.ok && page.value.links.map((l) => [l.title, l.kindLabel, l.meta?.modifiedBy, l.meta?.tabs?.map((t) => t.title)])).toEqual([["Zenith media plan Oct", "Media plan", "Rahul Krishnan", ["Media plan", "Contacts"]]]);
    expect(page.ok && [page.value.canEdit, page.value.links[0]!.frameUrl]).toEqual([false, "https://docs.google.com/spreadsheets/d/1MEDIAplanZenith000/edit?rm=minimal"]);
    expect(code(await links.add(designer(), { clientId: ids.zenith, url: SHEET }))).toBe("forbidden");
    expect(code(await links.remove(designer(), id))).toBe("forbidden");
    // The private space: its edit-level member adds; a strategist who isn't a member doesn't even see it.
    expect(code(await links.add(designer(), { clientId: ids.founder, url: "https://docs.google.com/document/d/1FOUNDERdoc0000/edit" }))).toBe("ok");
    expect(code(await links.page(strategist(), ids.founder))).toBe("not_found");
    expect(code(await links.read(strategist(), id))).toBe("ok");
    const events = await db.execute<{ action: string }>(sql`select action from events where entity_type = 'client_link' order by occurred_at`);
    expect(events.map((e) => e.action)).toEqual(["client_link.added", "client_link.added"]);
  });

  it("says which account to share a file with when Google won't let Oppllo One read it", async () => {
    const links = build();
    const id = idOf(await links.add(strategist(), { clientId: ids.zenith, url: "https://docs.google.com/spreadsheets/d/1NOTsharedSheet0000/edit" }));
    const page = await links.page(strategist(), ids.zenith);
    expect(page.ok && page.value.links[0]!.problem).toMatch(/Share this file with oppllo-one@oppllo\.iam\.gserviceaccount\.com/);
    expect(await links.read(strategist(), id)).toMatchObject({ ok: false, error: { message: expect.stringMatching(/Share this file with/) } });
  });
});

describe("reading", () => {
  it("caches for 15 minutes, reads tabs in parts, keeps to listed tabs, and finds named ranges or says it can't", async () => {
    const links = build();
    const id = idOf(await links.add(strategist(), { clientId: ids.zenith, url: SHEET, kind: "media_plan" }));
    const first = await links.read(strategist(), id, { tab: "Media plan" });
    expect(first.ok && [first.value.text.split("\n").length, first.value.more]).toEqual([200, "More rows follow: read again from row 201."]);
    await links.read(strategist(), id, { tab: "Media plan" });
    expect(calls.values).toBe(1);
    now = new Date(now.getTime() + 16 * 60_000);
    await links.read(strategist(), id, { tab: "Media plan" });
    expect(calls.values).toBe(2);
    const later = await links.read(strategist(), id, { tab: "Media plan", startRow: 401 });
    expect(later.ok && [later.value.text.split("\n")[0], later.value.more]).toEqual(["Row 401\tMeta\t1400", null]);
    // Only the listed tabs once the team lists them.
    await links.settings(strategist(), { linkId: id, tabs: ["Media plan"] });
    expect(await links.read(strategist(), id, { tab: "Contacts" })).toMatchObject({ ok: false, error: { message: "Only these tabs can be read: Media plan." } });
    expect(await links.read(strategist(), id, { range: "'Contacts'!A1:B2" })).toMatchObject({ ok: false });
    // The Media plan summary: a found name, and a clear message for a missing one.
    expect(code(await links.settings(designer(), { linkId: id, summary: [{ label: "Planned", range: "PlannedBudget" }] }))).toBe("forbidden");
    await links.settings(strategist(), { linkId: id, summary: [{ label: "Planned", range: "PlannedBudget" }, { label: "Spent", range: "SpentToDate" }] });
    expect(await links.summary(strategist(), id)).toEqual({ ok: true, value: [{ label: "Planned", value: "₹1,20,000", problem: null }, { label: "Spent", value: null, problem: "Can't find SpentToDate in the sheet" }] });
  });

  it("the AI and the MCP read with the asker's permissions and never a file the team keeps from the AI", async () => {
    const links = build();
    const id = idOf(await links.add(strategist(), { clientId: ids.zenith, url: SHEET, kind: "media_plan" }));
    const tools = (a: ReturnType<typeof strategist>) => assistantTools(a, { clients: createClientService({ store, clock }), clientLinks: links, people: { directory: async () => ({ ok: true, value: [] }) } } as never);
    const run = (a: ReturnType<typeof strategist>, input: Record<string, unknown>) => tools(a).find((t) => t.name === "client_files")!.run({ client: "Zenith", file: "", tab: "", range: "", start_row: 1, part: 0, ...input });
    expect((await run(strategist(), {})).text).toContain("Zenith media plan Oct");
    expect((await run(strategist(), { file: "media plan", range: "PlannedBudget" })).text).toContain("₹1,20,000");
    const outsider = await addPerson(db, "Sneha Joy", ["designer"]);
    expect((await run(named(outsider, ["designer"], "Sneha Joy"), {})).ok).toBe(false);
    await links.settings(strategist(), { linkId: id, aiReadable: false });
    expect(await run(strategist(), { file: "media plan", tab: "Contacts" })).toMatchObject({ ok: false, text: expect.stringMatching(/keeps this file away from the AI/) });
    // People can still open it themselves.
    expect(code(await links.read(strategist(), id, { tab: "Contacts" }))).toBe("ok");
  });
});

describe("the daily job", () => {
  it("tells the team's chat once a day when a file changes, and writes back only to the Oppllo data tab, only when on", async () => {
    const links = build();
    const id = idOf(await links.add(strategist(), { clientId: ids.zenith, url: SHEET, kind: "media_plan" }));
    expect(await links.runDaily()).toMatchObject({ noticed: 0, written: 0 });
    files.get("1MEDIAplanZenith000")!.modified = "2026-10-21T05:00:00Z";
    expect((await links.runDaily()).noticed).toBe(1);
    files.get("1MEDIAplanZenith000")!.modified = "2026-10-21T06:00:00Z";
    expect((await links.runDaily()).noticed).toBe(0);
    now = new Date("2026-10-22T06:30:00Z");
    expect((await links.runDaily()).noticed).toBe(1);
    const notes = await db.execute<{ body: string; kind: string }>(sql`select m.body, c.kind from chat_messages m join chat_channels c on c.id = m.channel_id`);
    expect(notes.map((n) => [n.kind, n.body])).toEqual([
      ["client", "📄 Media plan “Zenith media plan Oct” was updated in Google by Rahul Krishnan."],
      ["client", "📄 Media plan “Zenith media plan Oct” was updated in Google by Rahul Krishnan."],
    ]);
    expect(calls.writes).toEqual([]);
    expect(code(await links.settings(marketer(), { linkId: id, writeBack: true }))).toBe("forbidden");
    await links.settings(strategist(), { linkId: id, writeBack: true });
    await links.runDaily();
    expect(calls.writes.map((w) => [w.id, w.tab])).toEqual([["1MEDIAplanZenith000", "Oppllo data"]]);
  });
});

describe("artifacts and plain links", () => {
  it("uploads .html and .md pages with checks, shows them, and lets the AI read their text", async () => {
    const links = build();
    const bytes = new TextEncoder().encode("<html><body><h1>Setup guide</h1><script>steal()</script><p>Open Settings.</p></body></html>");
    const id = idOf(await links.upload(strategist(), { clientId: ids.zenith, title: "" }, { name: "Setup guide.html", bytes }));
    expect(code(await links.upload(strategist(), { clientId: ids.zenith }, { name: "run.exe", bytes }))).toBe("invalid");
    expect(code(await links.upload(strategist(), { clientId: ids.zenith }, { name: "x.html", bytes: new Uint8Array([0x4d, 0x5a, 0, 1]) }))).toBe("invalid");
    expect(code(await links.upload(strategist(), { clientId: ids.zenith }, { name: "big.md", bytes: new Uint8Array(3_600_000).fill(65) }))).toBe("invalid");
    expect(await links.artifact(designer(), id)).toMatchObject({ ok: true, value: { format: "html", title: "Setup guide", content: expect.stringContaining("<h1>Setup guide</h1>") } });
    expect(await links.readForAi(strategist(), ids.zenith, "setup guide", {})).toEqual({ ok: true, value: { text: "Setup guide\nOpen Settings.", more: null } });
  });

  it("keeps links working as plain links without Google keys", async () => {
    const links = build(false);
    const id = idOf(await links.add(strategist(), { clientId: ids.zenith, url: SHEET, title: "Media plan" }));
    const page = await links.page(strategist(), ids.zenith);
    expect(page.ok && [page.value.google.connected, page.value.links[0]!.openUrl, page.value.links[0]!.meta]).toEqual([false, "https://docs.google.com/spreadsheets/d/1MEDIAplanZenith000/edit", null]);
    expect(await links.read(strategist(), id)).toMatchObject({ ok: false, error: { message: expect.stringMatching(/Google isn't connected yet/) } });
    expect(await links.runDaily()).toEqual({ noticed: 0, written: 0, errors: [] });
  });
});
