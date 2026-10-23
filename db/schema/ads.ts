// Ad results on the client page (Stage 10.1, D92): which Meta ad account belongs to which client, and a short-lived
// cache of what Meta reported, so the client page stays fast and Meta isn't asked on every view.
import { sql } from "drizzle-orm";
import { jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { clients } from "./clients";
import { createdAt, id } from "./columns";
import { people } from "./people";

export const clientAdAccounts = pgTable(
  "client_ad_accounts",
  {
    id: id(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    platform: text("platform").$type<"meta">().notNull(),
    /** Meta's ad account id, digits only (without "act_"). */
    accountId: text("account_id").notNull(),
    linkedById: uuid("linked_by_id").references(() => people.id),
    createdAt: createdAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("client_ad_accounts_uq").on(t.clientId, t.platform).where(sql`${t.deletedAt} is null`)],
);

export const adInsightCache = pgTable(
  "ad_insight_cache",
  {
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    /** e.g. "meta:this_month". */
    rangeKey: text("range_key").notNull(),
    data: jsonb("data").$type<unknown>().notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.clientId, t.rangeKey] })],
);
