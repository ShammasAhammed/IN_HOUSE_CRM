// Won leads read from the prospect CRM (crm.oppllo.com, Firebase project oppllo-crm; Stage 8.3, D84). The CRM is
// never written to; these rows are the "won, set up?" list. A lead counts as set up once a client carries its id.
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id } from "./columns";
import { people } from "./people";

export const crmWonLeads = pgTable(
  "crm_won_leads",
  {
    id: id(),
    crmLeadId: text("crm_lead_id").notNull(),
    name: text("name").notNull(),
    institution: text("institution"),
    phone: text("phone"),
    segment: text("segment"),
    ownerName: text("owner_name"),
    wonAt: timestamp("won_at", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    dismissedById: uuid("dismissed_by_id").references(() => people.id),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("crm_won_leads_lead_uq").on(t.crmLeadId), index("crm_won_leads_won_idx").on(t.wonAt)],
);
