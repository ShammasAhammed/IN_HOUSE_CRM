// Adding and editing clients, contacts and teams (clients.write; contact details per D14).
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { createClientAdminService } from "@/services/client-admin";
import { actorOf, addClient, addPerson, eventsFor, fixedClock, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const admin = createClientAdminService({ store, clock: fixedClock("2026-10-20") });
const ids = {} as Record<"strategist" | "strategist2" | "designer" | "accountant" | "bdo" | "client", string>;
const strategist = () => actorOf(ids.strategist, ["strategist"]);

const base = { name: "Zenith IAS Academy", segment: "coaching", status: "onboarding", city: "Kochi", startDate: "", gstin: "", billingAddress: "", leadStrategistId: "" };

beforeEach(async () => {
  await wipe(db);
  ids.strategist = await addPerson(db, "Anjali Nair", ["strategist"]);
  ids.strategist2 = await addPerson(db, "Rahul Menon", ["strategist"]);
  ids.designer = await addPerson(db, "Vishnu Prasad", ["designer"]);
  ids.accountant = await addPerson(db, "Reshma Thomas", ["accountant"]);
  ids.bdo = await addPerson(db, "Ajmal K", ["bdo"]);
  ids.client = await addClient(db, "Medcrest NEET Coaching", { strategistId: ids.strategist, members: [ids.strategist] });
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("adding a client", () => {
  it("creates it with its lead strategist on the team", async () => {
    const r = await admin.create(actorOf(ids.bdo, ["bdo"]), { ...base, leadStrategistId: ids.strategist2, gstin: "32abcde1234f1z5" });
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    const details = await store.clients.findDetails(r.value.id);
    expect(details).toMatchObject({ name: "Zenith IAS Academy", gstin: "32ABCDE1234F1Z5", leadStrategistId: ids.strategist2, startDate: null });
    expect((await store.clients.listMembers(r.value.id)).map((m) => m.personId)).toEqual([ids.strategist2]);
    expect((await eventsFor(db, r.value.id)).map((e) => e.action)).toEqual(["client.created"]);
  });

  it("refuses a name that's already a client, ignoring case", async () => {
    const r = await admin.create(strategist(), { ...base, name: "medcrest neet coaching" });
    expect(!r.ok && r.error.fieldErrors?.name).toEqual(["There's already a client with this name."]);
  });

  it("says plainly when the name is only spaces (QA S9-05)", async () => {
    const r = await admin.create(strategist(), { ...base, name: "   " });
    expect(r).toMatchObject({ ok: false, error: { fieldErrors: { name: ["Please enter the client's name."] } } });
  });

  it("keeps a Drive folder link, https only (QA S4-B5)", async () => {
    const bad = await admin.create(strategist(), { ...base, name: "TEST Drive Client", driveFolderUrl: "drive.google.com/x" });
    expect(!bad.ok && bad.error.fieldErrors?.driveFolderUrl).toEqual(["Paste a link starting with https://"]);
    const r = await admin.create(strategist(), { ...base, name: "TEST Drive Client", driveFolderUrl: "https://drive.google.com/drive/folders/abc" });
    if (!r.ok) throw new Error(r.error.message);
    expect((await store.clients.findDetails(r.value.id))?.driveFolderUrl).toBe("https://drive.google.com/drive/folders/abc");
  });

  it("refuses a lead who isn't a strategist, and a bad GSTIN", async () => {
    const lead = await admin.create(strategist(), { ...base, leadStrategistId: ids.designer });
    expect(!lead.ok && lead.error.fieldErrors?.leadStrategistId).toEqual(["Pick a strategist."]);
    const gst = await admin.create(strategist(), { ...base, gstin: "1234" });
    expect(!gst.ok && gst.error.fieldErrors?.gstin).toBeDefined();
  });

  it("is not for designers or the accountant", async () => {
    for (const [id, role] of [[ids.designer, "designer"], [ids.accountant, "accountant"]] as const) {
      const r = await admin.create(actorOf(id, [role]), base);
      expect(r.ok ? "ok" : r.error.code).toBe("forbidden");
      const form = await admin.form(actorOf(id, [role]), ids.client);
      expect(form.ok ? "ok" : form.error.code).toBe("forbidden");
    }
  });
});

describe("editing a client", () => {
  it("records what changed without the values, and a status change on its own", async () => {
    const r = await admin.update(strategist(), ids.client, { ...base, name: "Medcrest NEET Coaching", status: "paused", leadStrategistId: ids.strategist, gstin: "32ABCDE1234F1Z5" });
    expect(r.ok).toBe(true);
    const events = await db.select({ action: s.events.action, data: s.events.data }).from(s.events).where(sql`${s.events.clientId} = ${ids.client}`).orderBy(s.events.occurredAt);
    expect(events).toEqual([
      { action: "client.updated", data: { fields: ["segment", "city", "status", "billing details"] } },
      { action: "client.status_changed", data: { from: "active", to: "paused" } },
    ]);
  });

  it("saving the same values changes nothing", async () => {
    const form = await admin.form(strategist(), ids.client);
    if (!form.ok) throw new Error(form.error.message);
    const c = form.value.client;
    const r = await admin.update(strategist(), ids.client, { ...c, startDate: c.startDate ?? "", legalName: c.legalName ?? "", city: c.city ?? "", gstin: "", billingAddress: "", crmLeadId: "", notes: "", leadStrategistId: c.leadStrategistId ?? "" });
    expect(r.ok).toBe(true);
    expect(await eventsFor(db, ids.client)).toEqual([]);
  });

  it("puts a new lead strategist on the team", async () => {
    await admin.update(strategist(), ids.client, { ...base, name: "Medcrest NEET Coaching", status: "active", leadStrategistId: ids.strategist2 });
    expect((await store.clients.listMembers(ids.client)).map((m) => m.personId).sort()).toEqual([ids.strategist, ids.strategist2].sort());
  });
});

describe("contacts", () => {
  it("keeps exactly one primary contact as contacts come and go", async () => {
    const [existing] = await store.clients.listContacts([ids.client]);
    const added = await admin.addContact(strategist(), { clientId: ids.client, name: "Priya Varghese", phone: "+91 94470 11223", email: "", isPrimary: "on" });
    if (!added.ok) throw new Error(JSON.stringify(added.error));
    let contacts = await store.clients.listContacts([ids.client]);
    expect(contacts.filter((c) => c.isPrimary).map((c) => c.id)).toEqual([added.value.id]);

    expect((await admin.removeContact(strategist(), { contactId: added.value.id })).ok).toBe(true);
    contacts = await store.clients.listContacts([ids.client]);
    expect(contacts.map((c) => [c.id, c.isPrimary])).toEqual([[existing!.id, true]]);
    expect((await eventsFor(db, added.value.id)).map((e) => e.action)).toEqual(["client.contact_added", "client.contact_removed"]);
  });

  it("checks phone numbers", async () => {
    const r = await admin.addContact(strategist(), { clientId: ids.client, name: "Priya", phone: "call me" });
    expect(!r.ok && r.error.fieldErrors?.phone).toBeDefined();
  });
});

describe("the team", () => {
  it("adds and removes people, but not the lead", async () => {
    const add = await admin.addMember(strategist(), { clientId: ids.client, personId: ids.designer });
    expect(add.ok).toBe(true);
    expect((await admin.addMember(strategist(), { clientId: ids.client, personId: ids.designer })).ok).toBe(true);
    expect((await store.clients.listMembers(ids.client)).map((m) => m.personId)).toContain(ids.designer);

    const lead = await admin.removeMember(strategist(), { clientId: ids.client, personId: ids.strategist });
    expect(!lead.ok && lead.error.message).toBe("They lead this client. Pick another lead first.");

    expect((await admin.removeMember(strategist(), { clientId: ids.client, personId: ids.designer })).ok).toBe(true);
    expect((await store.clients.listMembers(ids.client)).map((m) => m.personId)).toEqual([ids.strategist]);
    const actions = (await db.select({ action: s.events.action }).from(s.events).where(sql`${s.events.clientId} = ${ids.client}`)).map((e) => e.action);
    expect(actions).toEqual(["client.member_added", "client.member_removed"]);
  });

  it("is not for designers", async () => {
    const r = await admin.addMember(actorOf(ids.designer, ["designer"]), { clientId: ids.client, personId: ids.designer });
    expect(r.ok ? "ok" : r.error.code).toBe("forbidden");
  });
});
