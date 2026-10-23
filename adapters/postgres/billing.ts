import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { clients, invoices, people } from "@/db/schema";
import type { BillingRepository } from "@/repositories";
import type { Db } from "./connection";

export function billingRepository(db: Db): BillingRepository {
  return {
    async lockClient(clientId) {
      await db.execute(sql`select pg_advisory_xact_lock(hashtext(${"billing:" + clientId}))`);
    },
    async clientLinks(clientId) {
      const [r] = await db
        .select({ id: clients.id, name: clients.name, gstin: clients.gstin, billingAddress: clients.billingAddress, driveFolderId: clients.driveFolderId, driveFolderUrl: clients.driveFolderUrl, zohoContactId: clients.zohoContactId })
        .from(clients)
        .where(and(eq(clients.id, clientId), isNull(clients.deletedAt)));
      return r ?? null;
    },
    async setDriveFolder(clientId, folder) {
      await db.update(clients).set({ driveFolderId: folder.id, driveFolderUrl: folder.url, updatedAt: new Date() }).where(eq(clients.id, clientId));
    },
    async setZohoContact(clientId, contactId) {
      await db.update(clients).set({ zohoContactId: contactId, updatedAt: new Date() }).where(eq(clients.id, clientId));
    },
    async invoices(clientId) {
      return db
        .select({
          id: invoices.id,
          clientId: invoices.clientId,
          engagementId: invoices.engagementId,
          invoiceDate: invoices.invoiceDate,
          description: invoices.description,
          amountPaise: invoices.amountPaise,
          number: invoices.number,
          url: invoices.url,
          createdByName: people.fullName,
          createdAt: invoices.createdAt,
        })
        .from(invoices)
        .leftJoin(people, eq(people.id, invoices.createdById))
        .where(eq(invoices.clientId, clientId))
        .orderBy(desc(invoices.invoiceDate), desc(invoices.createdAt))
        .limit(50);
    },
    async addInvoice(row) {
      await db.insert(invoices).values(row);
    },
  };
}
