// Zoho Books (ops extra): draft invoices for clients. The only place that talks to Zoho (CLAUDE.md). Sign-in is
// a self-client refresh token (docs/zoho-books.md); every invoice is made as a draft so the accountant checks the tax
// and sends it from Zoho.
import type { InvoiceBook, InvoiceDraft } from "@/repositories";

export type ZohoDeps = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  organizationId: string;
  /** Zoho's data centre: "in" for India (default), "com", "eu" … */
  dc?: string;
  fetch?: typeof fetch;
  now?: () => number;
};

const rupees = (paise: number) => Math.round(paise) / 100;

export function zohoBooks(deps: ZohoDeps): InvoiceBook {
  const http = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const dc = (deps.dc || "in").replace(/[^a-z.]/g, "");
  const api = `https://www.zohoapis.${dc}/books/v3`;
  let token: { value: string; expiresAt: number } | null = null;

  async function accessToken(): Promise<string> {
    if (token && token.expiresAt - 60_000 > now()) return token.value;
    const res = await http(`https://accounts.zoho.${dc}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ refresh_token: deps.refreshToken, client_id: deps.clientId, client_secret: deps.clientSecret, grant_type: "refresh_token" }),
    });
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
    if (!res.ok || !body.access_token) throw new Error(`Zoho sign-in failed (${res.status}${body.error ? `: ${body.error}` : ""}).`);
    token = { value: body.access_token, expiresAt: now() + (body.expires_in ?? 3600) * 1000 };
    return token.value;
  }

  async function request<T>(method: "GET" | "POST", path: string, payload?: unknown, query = ""): Promise<T> {
    const res = await http(`${api}${path}?organization_id=${encodeURIComponent(deps.organizationId)}${query}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Zoho-oauthtoken ${await accessToken()}` },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    const body = (await res.json().catch(() => ({}))) as T & { code?: number; message?: string };
    if (!res.ok || (body.code !== undefined && body.code !== 0)) throw new Error(`Zoho Books said ${res.status}: ${body.message ?? "unknown error"}`);
    return body;
  }

  return {
    connected: true,
    async createDraft(d: InvoiceDraft) {
      let contactId = d.contactId;
      if (!contactId) {
        // A contact left by an earlier try (or made by hand) is reused: Zoho refuses two with one name.
        const found = await request<{ contacts?: Array<{ contact_id: string; contact_name: string }> }>("GET", "/contacts", undefined, `&contact_name=${encodeURIComponent(d.customerName)}`);
        contactId = found.contacts?.find((c) => c.contact_name.toLowerCase() === d.customerName.toLowerCase())?.contact_id ?? null;
      }
      if (!contactId) {
        const c = await request<{ contact: { contact_id: string } }>("POST", "/contacts", {
          contact_name: d.customerName,
          contact_type: "customer",
          ...(d.gstin ? { gst_no: d.gstin, gst_treatment: "business_gst" } : { gst_treatment: "business_none" }),
          ...(d.billingAddress ? { billing_address: { address: d.billingAddress.slice(0, 500) } } : {}),
        });
        contactId = c.contact.contact_id;
      }
      const inv = await request<{ invoice: { invoice_id: string; invoice_number: string } }>("POST", "/invoices", {
        customer_id: contactId,
        date: d.date,
        reference_number: d.reference.slice(0, 50),
        line_items: d.lines.map((l) => ({ name: l.name.slice(0, 100), description: l.description?.slice(0, 2000) ?? "", rate: rupees(l.ratePaise), quantity: l.quantity })),
      });
      return { contactId, invoiceId: inv.invoice.invoice_id, number: inv.invoice.invoice_number, url: `https://books.zoho.${dc}/app/${encodeURIComponent(deps.organizationId)}#/invoices/${encodeURIComponent(inv.invoice.invoice_id)}` };
    },
  };
}

export function notConnectedZohoBooks(): InvoiceBook {
  return {
    connected: false,
    async createDraft() {
      throw new Error("Zoho Books isn't connected (docs/zoho-books.md).");
    },
  };
}
