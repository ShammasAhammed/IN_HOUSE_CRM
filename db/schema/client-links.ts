// A client's files that live elsewhere (Stage 13.0): Google Sheets, Docs and Slides (read through the Drive service
// account), other links, and Claude artifact pages (linked, or uploaded through the storage interface). Google stays
// the editor; Oppllo One keeps the link, what Drive says about it, and a short cache of what was read.
import { sql } from "drizzle-orm";
import { bigint, boolean, check, date, index, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { CLIENT_LINK_KINDS, GOOGLE_TYPES, STORAGE_PROVIDERS, type ClientLinkKind, type GoogleType, type StorageProvider } from "@/lib/types";
import { clients } from "./clients";
import { createdAt, id, oneOf } from "./columns";
import { people } from "./people";

export const clientLinks = pgTable(
  "client_links",
  {
    id: id(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    kind: text("kind").$type<ClientLinkKind>().notNull(),
    title: text("title").notNull(),
    /** What was pasted; null for an uploaded artifact. */
    url: text("url"),
    googleType: text("google_type").$type<GoogleType>(),
    googleId: text("google_id"),
    /** An uploaded artifact page (.html or .md), through the storage interface. */
    fileProvider: text("file_provider").$type<StorageProvider>(),
    fileLocation: text("file_location"),
    fileId: text("file_id"),
    fileName: text("file_name"),
    fileSize: bigint("file_size", { mode: "number" }),
    /** Tabs people and the AI may read; empty means every tab. */
    tabs: text("tabs").array().notNull().default(sql`'{}'::text[]`),
    /** The Media plan summary: label → named range, mapped by the owner or a strategist. */
    summary: jsonb("summary").$type<Array<{ label: string; range: string }>>().notNull().default(sql`'[]'::jsonb`),
    /** Off for sheets with personal data: the AI and the MCP don't read them. */
    aiReadable: boolean("ai_readable").notNull().default(true),
    /** Write-back: Oppllo One fills one tab, "Oppllo data" (off by default). */
    writeBack: boolean("write_back").notNull().default(false),
    /** What Drive said last: title, last change and by whom, tabs and named ranges, or why it couldn't read. */
    meta: jsonb("meta").$type<{ title?: string; modifiedTime?: string | null; modifiedBy?: string | null; tabs?: Array<{ title: string; rows: number; cols: number }>; namedRanges?: string[]; problem?: string; reason?: string }>(),
    metaAt: timestamp("meta_at", { withTimezone: true }),
    /** The change notice (once a day per file): the last change it told the team about, and the day. */
    seenModifiedAt: timestamp("seen_modified_at", { withTimezone: true }),
    noticedOn: date("noticed_on"),
    addedById: uuid("added_by_id").references(() => people.id),
    createdAt: createdAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("client_links_client_idx").on(t.clientId).where(sql`${t.deletedAt} is null`),
    check("client_links_kind_ck", oneOf(t.kind, CLIENT_LINK_KINDS)),
    check("client_links_google_ck", sql`${t.googleType} is null or ${oneOf(t.googleType, GOOGLE_TYPES)}`),
    check("client_links_file_ck", sql`${t.fileProvider} is null or ${oneOf(t.fileProvider, STORAGE_PROVIDERS)}`),
    check("client_links_source_ck", sql`(${t.url} is not null) <> (${t.fileId} is not null)`),
  ],
);

/** What was read from a Google file, for 15 minutes. */
export const clientLinkCache = pgTable(
  "client_link_cache",
  {
    linkId: uuid("link_id")
      .notNull()
      .references(() => clientLinks.id),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.linkId, t.key] })],
);
