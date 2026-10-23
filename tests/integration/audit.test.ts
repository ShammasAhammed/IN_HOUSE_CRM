// The audit log (Stage 11.7): the owner sees every change, filtered and paged, in plain words.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createAuditService } from "@/services/audit";
import { actorOf, addClient, addPerson, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const audit = createAuditService({ store });
let owner = "";
let strategist = "";
let zenith = "";

beforeEach(async () => {
  await wipe(db);
  owner = await addPerson(db, "Faisal Rahman", ["owner"]);
  strategist = await addPerson(db, "Anjali Nair", ["strategist"]);
  zenith = await addClient(db, "Zenith IAS Academy");
  const alpha = await addClient(db, "Alpha Nursing College");
  for (let i = 0; i < 55; i++) await store.events.record({ actorId: strategist, action: "client.updated", entityType: "client", entityId: alpha, clientId: alpha });
  await store.events.record({ actorId: owner, action: "client.ad_account_linked", entityType: "client_ad_account", entityId: zenith, clientId: zenith });
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("audit log", () => {
  it("is the owner's, in plain words, newest first, a page at a time", async () => {
    const no = await audit.list(actorOf(strategist, ["strategist"]), {});
    expect(no.ok ? "ok" : no.error.code).toBe("forbidden");
    const p1 = await audit.list(actorOf(owner, ["owner"]), {});
    expect(p1.ok && p1.value.rows).toHaveLength(50);
    expect(p1.ok && p1.value.hasMore).toBe(true);
    expect(p1.ok && p1.value.rows[0]).toMatchObject({ actorName: "Faisal Rahman", text: "linked an ad account", clientName: "Zenith IAS Academy" });
    const p2 = await audit.list(actorOf(owner, ["owner"]), { page: "2" });
    expect(p2.ok && [p2.value.rows.length, p2.value.hasMore]).toEqual([6, false]);
  });

  it("filters by person, type, client and day, and ignores malformed filters", async () => {
    const o = actorOf(owner, ["owner"]);
    const byPerson = await audit.list(o, { person: owner });
    expect(byPerson.ok && byPerson.value.rows.map((r) => r.action)).toEqual(["client.ad_account_linked"]);
    const byClient = await audit.list(o, { client: zenith, type: "client_ad_account" });
    expect(byClient.ok && byClient.value.rows).toHaveLength(1);
    const future = await audit.list(o, { from: "2999-01-01" });
    expect(future.ok && future.value.rows).toHaveLength(0);
    const junk = await audit.list(o, { person: "x", type: "nope", from: "yesterday", page: "-4" });
    expect(junk.ok && junk.value.query).toEqual({ person: "", type: "", client: "", from: "", to: "", page: 1 });
  });
});
