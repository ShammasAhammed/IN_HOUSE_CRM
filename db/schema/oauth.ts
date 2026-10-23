// The Oppllo MCP's sign-in (Stage 9.3, D87): OAuth 2.1 with PKCE, so Claude (or another AI app) acts as one person, with
// that person's own permissions. Apps register themselves; a person approves one in Oppllo One; the app gets
// short-lived access tokens and a refresh token. Only hashes of codes and tokens are stored.
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id } from "./columns";
import { people } from "./people";

/** An app that registered itself (OAuth dynamic client registration). Registering grants nothing. */
export const oauthClients = pgTable("oauth_clients", {
  id: id(),
  /** The public client id the app sends; random, not guessable. */
  clientId: text("client_id").notNull().unique(),
  name: text("name").notNull(),
  redirectUris: jsonb("redirect_uris").$type<string[]>().notNull(),
  createdAt: createdAt(),
});

/** One-time codes from the approval screen, good for ten minutes. */
export const oauthCodes = pgTable(
  "oauth_codes",
  {
    id: id(),
    codeHash: text("code_hash").notNull(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => oauthClients.id),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    redirectUri: text("redirect_uri").notNull(),
    codeChallenge: text("code_challenge").notNull(),
    resource: text("resource"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("oauth_codes_hash_uq").on(t.codeHash)],
);

/** A person's approval of one app: its current access and refresh tokens. Revoking ends it for good. */
export const mcpConnections = pgTable(
  "mcp_connections",
  {
    id: id(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => oauthClients.id),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    accessHash: text("access_hash").notNull(),
    accessExpiresAt: timestamp("access_expires_at", { withTimezone: true }).notNull(),
    refreshHash: text("refresh_hash").notNull(),
    refreshExpiresAt: timestamp("refresh_expires_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("mcp_connections_access_uq").on(t.accessHash), uniqueIndex("mcp_connections_refresh_uq").on(t.refreshHash), index("mcp_connections_person_idx").on(t.personId)],
);
