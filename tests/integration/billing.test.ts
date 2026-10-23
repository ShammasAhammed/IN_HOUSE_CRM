// Ops extras: a Drive folder per client, and Zoho Books draft invoices, with fakes standing in for Google and Zoho.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ClientFolders, InvoiceBook, InvoiceDraft } from "@/repositories";
import { createBillingService } from "@/services/billing";
import { actorOf, addClient, addPerson, fixedClock, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const clock = fixedClock("2026-10-16");
let made = 0;
const folders: ClientFolders = { connected: true, ensure: async (name) => ({ id: `f${++made}`, url: `https://drive.google.com/drive/folders/f${made}?${encodeURIComponent(name)}` }) };
const drafts: InvoiceDraft[] = [];
const books: InvoiceBook = { connected: true, createDraft: async (d) => (drafts.push(d), { contactId: "zc1", invoiceId: `zi${drafts.length}`, number: `INV-${drafts.length}`, url: `https://books.zoho.in/x/${drafts.length}` }) };
const billing = createBillingService({ store, clock, folders, books });

let ids: Record<"owner" | "accountant" | "designer" | "client", string>;
const owner = () => actorOf(ids.owner, ["owner"]);
const accountant = () => actorOf(ids.accountant, ["accountant"]);
const designer = () => actorOf(ids.designer, ["designer"]);

beforeEach(async () => {
  await wipe(db);
  made = 0;
  drafts.length = 0;
  const o = await addPerson(db, "Faisal Rahman", ["owner"]);
  ids = { owner: o, accountant: await addPerson(db, "Ann Mary", ["accountant"]), designer: await addPerson(db, "Vishnu Prasad", ["designer"]), client: await addClient(db, "Zenith IAS Academy") };
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("client Drive folder", () => {
  it("made once by those who change clients; others only see it", async () => {
    expect(await billing.makeFolder(designer(), ids.client)).toMatchObject({ ok: false });
    const a = await billing.makeFolder(owner(), ids.client);
    const b = await billing.makeFolder(owner(), ids.client);
    expect(a).toMatchObject({ ok: true });
    expect(b).toEqual(a);
    expect(made).toBe(1);
    expect(await billing.panel(owner(), ids.client)).toMatchObject({ ok: true, value: { drive: { url: expect.stringContaining("f1") } } });
  });
});

describe("Zoho invoices", () => {
  it("accountant and owner draft; the contact is kept; a double click makes one", async () => {
    expect(await billing.createInvoice(designer(), { clientId: ids.client, description: "Retainer Oct", amountRupees: "45000" })).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(await billing.createInvoice(accountant(), { clientId: ids.client, description: "Retainer Oct", amountRupees: "0" })).toMatchObject({ ok: false, error: { code: "invalid" } });
    const r = await billing.createInvoice(accountant(), { clientId: ids.client, description: "Retainer Oct", amountRupees: "45000.50" });
    expect(r).toMatchObject({ ok: true, value: { number: "INV-1" } });
    expect(drafts[0]).toMatchObject({ contactId: null, customerName: "Zenith IAS Academy", date: "2026-10-16", lines: [{ ratePaise: 4500050, quantity: 1 }] });
    expect(await billing.createInvoice(accountant(), { clientId: ids.client, description: "Retainer Oct", amountRupees: "45000.50" })).toMatchObject({ ok: false, error: { code: "invalid" } });
    await billing.createInvoice(owner(), { clientId: ids.client, description: "Launch reel", amountRupees: "8000" });
    expect(drafts[1]!.contactId).toBe("zc1");
    const panel = await billing.panel(accountant(), ids.client);
    expect(panel.ok && panel.value.invoices?.list.map((i) => i.number).sort()).toEqual(["INV-1", "INV-2"]);
    // Two clicks at once: one invoice, one folder.
    const twice = await Promise.all([1, 2].map(() => billing.createInvoice(owner(), { clientId: ids.client, description: "Ads top-up", amountRupees: "5000" })));
    expect(twice.filter((r) => r.ok)).toHaveLength(1);
    await Promise.all([billing.makeFolder(owner(), ids.client), billing.makeFolder(owner(), ids.client)]);
    expect(made).toBe(1);
    const hidden = await billing.panel(owner(), ids.client);
    expect(hidden.ok && hidden.value.invoices).toBeTruthy();
  });
});
