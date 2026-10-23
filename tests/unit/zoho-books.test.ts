// The Zoho Books adapter against a fake Zoho: sign-in, a contact made once, a draft invoice in rupees.
import { describe, expect, it } from "vitest";
import { zohoBooks } from "@/adapters/zoho/books";

function fakeZoho(existing: Array<{ contact_id: string; contact_name: string }> = []) {
  const calls: Array<{ url: URL; body: unknown; auth: string | null }> = [];
  const fake = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const body = init?.body instanceof URLSearchParams ? Object.fromEntries(init.body) : init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, body, auth: new Headers(init?.headers).get("Authorization") });
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    if (url.hostname === "accounts.zoho.in") return json({ access_token: "tok", expires_in: 3600 });
    if (url.pathname.endsWith("/contacts") && init?.method === "GET") return json({ code: 0, contacts: existing });
    if (url.pathname.endsWith("/contacts")) return json({ code: 0, contact: { contact_id: "c1" } });
    if (url.pathname.endsWith("/invoices")) return json({ code: 0, invoice: { invoice_id: "i1", invoice_number: "INV-0001" } });
    return new Response("{}", { status: 404 });
  }) as typeof globalThis.fetch;
  return { fetch: fake, calls };
}

const draft = { contactId: null, customerName: "Zenith IAS", gstin: "32ABCDE1234F1Z5", billingAddress: "Kochi", date: "2026-10-16" as const, reference: "Oppllo 2026-10", lines: [{ name: "Retainer", description: null, ratePaise: 4500050, quantity: 1 }] };

describe("zoho books", () => {
  it("signs in, makes the contact, then a draft invoice in rupees", async () => {
    const z = fakeZoho();
    const books = zohoBooks({ clientId: "id", clientSecret: "secret", refreshToken: "refresh", organizationId: "org1", fetch: z.fetch });
    const r = await books.createDraft(draft);
    expect(r).toEqual({ contactId: "c1", invoiceId: "i1", number: "INV-0001", url: "https://books.zoho.in/app/org1#/invoices/i1" });
    expect(z.calls[0]!.body).toMatchObject({ grant_type: "refresh_token", refresh_token: "refresh" });
    expect(z.calls[1]!.url.searchParams.get("organization_id")).toBe("org1");
    expect(z.calls[1]!.auth).toBe("Zoho-oauthtoken tok");
    expect(z.calls[1]!.url.searchParams.get("contact_name")).toBe("Zenith IAS");
    expect(z.calls[2]!.body).toMatchObject({ contact_name: "Zenith IAS", gst_no: "32ABCDE1234F1Z5", gst_treatment: "business_gst" });
    expect(z.calls[3]!.body).toMatchObject({ customer_id: "c1", line_items: [{ rate: 45000.5, quantity: 1 }] });
    // A known contact is reused, and the token too.
    await books.createDraft({ ...draft, contactId: "c1" });
    expect(z.calls.slice(4).map((c) => c.url.pathname)).toEqual(["/books/v3/invoices"]);
  });

  it("reuses a contact already in Zoho with the same name", async () => {
    const z = fakeZoho([{ contact_id: "old", contact_name: "zenith ias" }]);
    const books = zohoBooks({ clientId: "id", clientSecret: "secret", refreshToken: "refresh", organizationId: "org1", fetch: z.fetch });
    expect((await books.createDraft(draft)).contactId).toBe("old");
    expect(z.calls.filter((c) => c.url.pathname.endsWith("/contacts") && c.body)).toHaveLength(0);
  });

  it("says what Zoho said when it refuses", async () => {
    const fetch = (async (input: string | URL | Request) => (String(input).includes("accounts") ? new Response(JSON.stringify({ error: "invalid_code" }), { status: 400 }) : new Response("{}"))) as typeof globalThis.fetch;
    const books = zohoBooks({ clientId: "id", clientSecret: "s", refreshToken: "r", organizationId: "o", fetch });
    await expect(books.createDraft(draft)).rejects.toThrow(/invalid_code/);
  });
});
