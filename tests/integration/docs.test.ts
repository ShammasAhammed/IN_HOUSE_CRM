// Stage 9b.5: docs and wiki.
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Role } from "@/lib/types";
import { createDocService } from "@/services/docs";
import { actorOf, addClient, addPerson, eventsFor, fixedClock, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const docs = createDocService({ store, clock: fixedClock("2026-10-14") });

type Who = "strategist" | "designer" | "intern";
const ids = {} as Record<Who | "zenith" | "bright", string>;
const roles: Record<Who, Role[]> = { strategist: ["strategist"], designer: ["designer"], intern: ["intern"] };
const as = (who: Who) => actorOf(ids[who], roles[who]);
const must = <T,>(r: { ok: true; value: T } | { ok: false; error: { message: string } }): T => {
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};

beforeEach(async () => {
  await wipe(db);
  await db.execute(sql`truncate table doc_versions, docs cascade`);
  ids.strategist = await addPerson(db, "Anjali Nair", roles.strategist);
  ids.designer = await addPerson(db, "Vishnu Prasad", roles.designer);
  ids.intern = await addPerson(db, "Hiba Nasrin", roles.intern);
  ids.zenith = await addClient(db, "Zenith IAS Academy", { members: [ids.strategist, ids.designer] });
  ids.bright = await addClient(db, "Brightpath Nursing College", { members: [ids.strategist] });
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("docs", () => {
  it("shows team pages to everyone and client pages only to that client's people; sub-pages take their parent's client", async () => {
    const sop = must(await docs.create(as("intern"), { title: "How we post reels", body: "1. Hook\n2. CTA" })).id;
    const brand = must(await docs.create(as("strategist"), { title: "Zenith brand notes", clientId: ids.zenith })).id;
    const sub = must(await docs.create(as("designer"), { title: "Colours", parentId: brand })).id;
    expect(await docs.create(as("designer"), { title: "X", clientId: ids.bright })).toMatchObject({ ok: false, error: { code: "not_found" } });
    const tree = await docs.tree(as("designer"));
    expect(tree.nodes.map((n) => [n.title, n.children.map((c) => c.title)])).toEqual([
      ["How we post reels", []],
      ["Zenith brand notes", ["Colours"]],
    ]);
    expect((await docs.tree(as("intern"))).nodes.map((n) => n.title)).toEqual(["How we post reels"]);
    expect(await docs.get(as("intern"), sub)).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(must(await docs.get(as("designer"), sub))).toMatchObject({ clientId: ids.zenith, crumbs: [{ title: "Zenith brand notes" }] });
    expect((await docs.tree(as("designer"), { search: "hook" })).nodes.map((n) => n.title)).toEqual(["How we post reels"]);
    void sop;
  });

  it("keeps every version, refuses a stale save, and brings an old version back", async () => {
    const id = must(await docs.create(as("designer"), { title: "Shoot checklist", body: "v1" })).id;
    expect(must(await docs.update(as("strategist"), { docId: id, version: 1, title: "Shoot checklist", body: "v2" }))).toEqual({ id, version: 2 });
    expect(await docs.update(as("designer"), { docId: id, version: 1, title: "Shoot checklist", body: "my v2" })).toMatchObject({ ok: false, error: { code: "conflict" } });
    must(await docs.restore(as("designer"), { docId: id, version: 1 }));
    expect(must(await docs.get(as("designer"), id))).toMatchObject({ body: "v1", version: 3 });
    expect(must(await docs.versions(as("designer"), id)).map((v) => [v.version, v.body])).toEqual([
      [3, "v1"],
      [2, "v2"],
      [1, "v1"],
    ]);
    expect((await eventsFor(db, id)).map((e) => e.action)).toEqual(["doc.created", "doc.edited", "doc.edited"]);
  });

  it("refuses moving a page under itself, and archives only empty pages by their writer or a lead", async () => {
    const a = must(await docs.create(as("designer"), { title: "A" })).id;
    const b = must(await docs.create(as("designer"), { title: "B", parentId: a })).id;
    expect(await docs.update(as("designer"), { docId: a, version: 1, title: "A", body: "", parentId: b })).toMatchObject({ ok: false, error: { code: "invalid" } });
    expect(await docs.remove(as("intern"), b)).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(await docs.remove(as("designer"), a)).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(await docs.remove(as("strategist"), b)).toEqual({ ok: true, value: null });
    expect(await docs.remove(as("designer"), a)).toEqual({ ok: true, value: null });
    expect((await docs.tree(as("designer"))).nodes).toEqual([]);
  });
});
