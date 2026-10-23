// Invoices drafted in Zoho Books for a client (ops extra). Zoho keeps the invoice; this keeps the pointer, the
// amount and who made it, so the client page shows what was billed without asking Zoho.
import { date, index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { clients } from "./clients";
import { createdAt, id, paise } from "./columns";
import { engagements } from "./engagements";
import { people } from "./people";

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    engagementId: uuid("engagement_id").references(() => engagements.id),
    invoiceDate: date("invoice_date").notNull(),
    description: text("description").notNull(),
    amountPaise: paise("amount_paise").notNull(),
    provider: text("provider").notNull().default("zoho_books"),
    externalId: text("external_id").notNull(),
    number: text("number").notNull(),
    url: text("url").notNull(),
    createdById: uuid("created_by_id").references(() => people.id),
    createdAt: createdAt(),
  },
  (t) => [index("invoices_client_idx").on(t.clientId, t.invoiceDate)],
);
