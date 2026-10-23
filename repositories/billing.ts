// Client Drive folders and Zoho invoices (ops extras).
import type { IsoDate } from "@/lib/dates";

export type InvoiceRow = {
  id: string;
  clientId: string;
  engagementId: string | null;
  invoiceDate: IsoDate;
  description: string;
  amountPaise: number;
  number: string;
  url: string;
  createdByName: string | null;
  createdAt: Date;
};

export type ClientLinks = { id: string; name: string; gstin: string | null; billingAddress: string | null; driveFolderId: string | null; driveFolderUrl: string | null; zohoContactId: string | null };

export interface BillingRepository {
  /** Inside a transaction: one folder or invoice action per client at a time (double clicks, two tabs). */
  lockClient(clientId: string): Promise<void>;
  clientLinks(clientId: string): Promise<ClientLinks | null>;
  setDriveFolder(clientId: string, folder: { id: string; url: string }): Promise<void>;
  setZohoContact(clientId: string, contactId: string): Promise<void>;
  invoices(clientId: string): Promise<InvoiceRow[]>;
  addInvoice(row: { id: string; clientId: string; engagementId: string | null; invoiceDate: IsoDate; description: string; amountPaise: number; externalId: string; number: string; url: string; createdById: string }): Promise<void>;
}
