// Outside systems the ops extras talk to (Drive folders for clients, Zoho Books invoices). Each has a "not
// connected" stand-in until the owner adds its keys, so nothing else needs to know whether it is set up.
import type { IsoDate } from "@/lib/dates";

export interface ClientFolders {
  connected: boolean;
  /** The client's folder, made if it isn't there yet (found again by name if it is). */
  ensure(name: string): Promise<{ id: string; url: string }>;
}

export type InvoiceDraft = {
  /** The Zoho contact made for this client before, if any; otherwise one is made. */
  contactId: string | null;
  customerName: string;
  gstin: string | null;
  billingAddress: string | null;
  date: IsoDate;
  /** Our reference, shown on the invoice (e.g. the engagement and month). */
  reference: string;
  lines: Array<{ name: string; description: string | null; ratePaise: number; quantity: number }>;
};

export interface InvoiceBook {
  connected: boolean;
  /** A draft invoice in the books; the accountant reviews and sends it there. */
  createDraft(draft: InvoiceDraft): Promise<{ contactId: string; invoiceId: string; number: string; url: string }>;
}
