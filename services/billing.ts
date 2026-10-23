// Ops extras: a Google Drive folder per client, and draft invoices in Zoho Books. Both are off until the owner adds
// their keys (docs/google-drive.md, docs/zoho-books.md). The outside call happens first; only what it returned is
// saved, with an event, so a failed call leaves nothing half-done here.
import { z } from "zod";
import { forbidden, invalid, notFound, ok, type Result } from "@/lib/result";
import { isId, newId } from "@/lib/id";
import { isoDate, optionalId, parse } from "@/lib/validation/common";
import type { ClientFolders, DataStore, InvoiceBook, InvoiceRow } from "@/repositories";
import { change, commit, noChange } from "./change";
import type { Clock } from "./clock";
import { can, clientScope, type Actor } from "./permissions";

const invoiceSchema = z.object({
  clientId: z.uuid(),
  engagementId: optionalId,
  description: z.string().trim().min(3, { message: "Say what this invoice is for." }).max(500),
  amountRupees: z.coerce.number().positive({ message: "Enter the amount before GST." }).max(10_000_000),
  invoiceDate: z.union([z.literal(""), isoDate]).optional(),
});

/** The same invoice again within this long is taken as a double click, not a second invoice. */
const REPEAT_MS = 5 * 60_000;

export type BillingPanel = {
  drive: { connected: boolean; url: string | null; canMake: boolean };
  invoices: { connected: boolean; canCreate: boolean; list: InvoiceRow[] } | null;
};

export function createBillingService(deps: { store: DataStore; clock: Clock; folders: ClientFolders; books: InvoiceBook; report?: (err: unknown, context?: Record<string, unknown>) => void }) {
  const { store, clock, folders, books } = deps;
  const failure = (what: string, err: unknown, where: string) => {
    deps.report?.(err, { where });
    return invalid(`${what} didn't work: ${err instanceof Error ? err.message.slice(0, 200) : "unknown error"}`);
  };

  const service = {
    async panel(actor: Actor, clientId: string): Promise<Result<BillingPanel>> {
      if (!isId(clientId) || !(await store.clients.findById(clientId, clientScope(actor)))) return notFound("That client");
      const links = await store.billing.clientLinks(clientId);
      if (!links) return notFound("That client");
      const money = can(actor, "money.read");
      return ok({
        drive: { connected: folders.connected, url: links.driveFolderUrl, canMake: folders.connected && can(actor, "clients.write") },
        invoices: money ? { connected: books.connected, canCreate: books.connected, list: await store.billing.invoices(clientId) } : null,
      });
    },

    /** The client's Drive folder: made on first ask, then kept. Strategists and the owner. */
    async makeFolder(actor: Actor, clientId: string): Promise<Result<{ url: string }>> {
      if (!can(actor, "clients.write")) return forbidden("Strategists and the owner make client folders.");
      if (!folders.connected) return invalid("Google Drive isn't connected yet.");
      if (!isId(clientId) || !(await store.clients.findById(clientId, clientScope(actor)))) return notFound("That client");
      // Under the client's lock: a second click waits, then finds the folder already saved.
      return commit(store, async (repos) => {
        await repos.billing.lockClient(clientId);
        const links = await repos.billing.clientLinks(clientId);
        if (!links) return notFound("That client");
        if (links.driveFolderUrl) return noChange({ url: links.driveFolderUrl });
        let folder: { id: string; url: string };
        try {
          folder = await folders.ensure(links.name);
        } catch (err) {
          return failure("Making the Drive folder", err, "billing.makeFolder");
        }
        await repos.billing.setDriveFolder(clientId, folder);
        return change({ url: folder.url }, { actorId: actor.personId, action: "client.drive_folder_made", entityType: "client", entityId: clientId, clientId, data: { url: folder.url } });
      });
    },

    /** A draft invoice in Zoho Books; the accountant checks the tax and sends it from there. Accountant and owner. */
    async createInvoice(actor: Actor, raw: unknown): Promise<Result<{ id: string; number: string; url: string }>> {
      if (!can(actor, "money.read") || !can(actor, "clients.contacts.read")) return forbidden("The accountant and the owner make invoices.");
      if (!books.connected) return invalid("Zoho Books isn't connected yet.");
      const parsed = parse(invoiceSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      const client = await store.clients.findById(v.clientId, clientScope(actor));
      if (!client) return notFound("That client");
      // Spaces, Oppllo's own marketing included (14.5), are never billed.
      if (client.isInternal) return invalid("Spaces aren't billed: no invoices for Oppllo's own work.");
      const links = await store.billing.clientLinks(v.clientId);
      if (!links) return notFound("That client");
      if (v.engagementId) {
        const e = await store.engagements.findById(v.engagementId);
        if (!e || e.clientId !== v.clientId) return invalid("Pick one of this client's engagements.");
      }
      const amountPaise = Math.round(v.amountRupees * 100);
      const date = v.invoiceDate || clock.today();
      const id = newId();
      // Under the client's lock, so a double click waits and is then caught as a repeat; Zoho is called inside, and
      // only what it made is saved. If saving fails after Zoho made the draft, the number is reported to fix by hand.
      return commit(store, async (repos) => {
        await repos.billing.lockClient(v.clientId);
        const links = await repos.billing.clientLinks(v.clientId);
        if (!links) return notFound("That client");
        const now = clock.now();
        const recent = (await repos.billing.invoices(v.clientId)).find((i) => i.description === v.description && i.amountPaise === amountPaise && now.getTime() - i.createdAt.getTime() < REPEAT_MS);
        if (recent) return invalid(`That invoice was just made: ${recent.number}.`);
        let made: Awaited<ReturnType<InvoiceBook["createDraft"]>>;
        try {
          made = await books.createDraft({
            contactId: links.zohoContactId,
            customerName: links.name,
            gstin: links.gstin,
            billingAddress: links.billingAddress,
            date,
            reference: `Oppllo ${date.slice(0, 7)}`,
            lines: [{ name: v.description.slice(0, 100), description: v.description.length > 100 ? v.description : null, ratePaise: amountPaise, quantity: 1 }],
          });
        } catch (err) {
          return failure("Making the Zoho invoice", err, "billing.createInvoice");
        }
        try {
          if (made.contactId !== links.zohoContactId) await repos.billing.setZohoContact(v.clientId, made.contactId);
          await repos.billing.addInvoice({ id, clientId: v.clientId, engagementId: v.engagementId ?? null, invoiceDate: date, description: v.description, amountPaise, externalId: made.invoiceId, number: made.number, url: made.url, createdById: actor.personId });
        } catch (err) {
          deps.report?.(err, { where: "billing.createInvoice.save", zohoInvoice: made.number });
          return invalid(`Zoho made draft ${made.number}, but saving it here failed. Open it in Zoho Books; don't make it again.`);
        }
        return change({ id, number: made.number, url: made.url }, { actorId: actor.personId, action: "invoice.drafted", entityType: "invoice", entityId: id, clientId: v.clientId, data: { number: made.number, amountPaise } });
      });
    },
  };
  return service;
}

export type BillingService = ReturnType<typeof createBillingService>;
