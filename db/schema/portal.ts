// The client portal (Stage 11.6): client contacts invited to see their own results, creatives, requests and reports.
// A portal user is not a person at Oppllo and has no role: it is one contact of one client (D-11.6a/b).
import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { clientContacts, clients } from "./clients";
import { createdAt, id } from "./columns";
import { people } from "./people";

export const portalUsers = pgTable(
  "portal_users",
  {
    id: id(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => clientContacts.id),
    /** The contact's email when invited, lower-case. If the contact's email changes, the invite no longer works. */
    email: text("email").notNull(),
    invitedById: uuid("invited_by_id")
      .notNull()
      .references(() => people.id),
    createdAt: createdAt(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedById: uuid("revoked_by_id").references(() => people.id),
    lastSignInAt: timestamp("last_sign_in_at", { withTimezone: true }),
    /** The DPDP consent record made when they agreed to the portal's terms (11.7). */
    consentId: uuid("consent_id"),
  },
  (t) => [
    index("portal_users_client_idx").on(t.clientId),
    // One live invite per email: a sign-in always means one client.
    uniqueIndex("portal_users_email_uq").on(sql`lower(${t.email})`).where(sql`${t.revokedAt} is null`),
  ],
);

/** One-time sign-in links: only the hash is kept; each works once, for 30 minutes. */
export const portalLinkTokens = pgTable("portal_link_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  portalUserId: uuid("portal_user_id")
    .notNull()
    .references(() => portalUsers.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: createdAt(),
});
