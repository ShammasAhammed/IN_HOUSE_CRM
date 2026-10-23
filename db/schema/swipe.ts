// The swipe file (Stage 13.2): references saved for inspiration — links with a preview, YouTube and Instagram/Facebook
// embeds, screenshots and (with Drive) videos — each with notes and tags, per client or space. Other people's media is
// never downloaded: a link, an official embed or the team's own screenshot only.
import { sql } from "drizzle-orm";
import { bigint, check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { STORAGE_PROVIDERS, SWIPE_KINDS, type StorageProvider, type SwipeKind } from "@/lib/types";
import { boards } from "./boards";
import { clients } from "./clients";
import { createdAt, id, oneOf, updatedAt } from "./columns";
import { people } from "./people";

export const swipeItems = pgTable(
  "swipe_items",
  {
    id: id(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    /** The board it was saved from, if any. */
    boardId: uuid("board_id").references(() => boards.id),
    kind: text("kind").$type<SwipeKind>().notNull(),
    url: text("url"),
    title: text("title").notNull(),
    description: text("description"),
    /** The page's own preview picture (https), shown from its site; never copied here. */
    imageUrl: text("image_url"),
    site: text("site"),
    /** Meta's official embed (Instagram/Facebook oEmbed), shown in a closed-off frame. */
    embedHtml: text("embed_html"),
    /** A screenshot or the team's own video, through the storage interface. */
    fileProvider: text("file_provider").$type<StorageProvider>(),
    fileLocation: text("file_location"),
    fileId: text("file_id"),
    fileName: text("file_name"),
    fileSize: bigint("file_size", { mode: "number" }),
    contentType: text("content_type"),
    notes: text("notes").notNull().default(""),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    searchText: text("search_text").notNull().default(""),
    createdById: uuid("created_by_id").references(() => people.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("swipe_items_client_idx").on(t.clientId).where(sql`${t.deletedAt} is null`),
    check("swipe_items_kind_ck", oneOf(t.kind, SWIPE_KINDS)),
    check("swipe_items_file_ck", sql`${t.fileProvider} is null or ${oneOf(t.fileProvider, STORAGE_PROVIDERS)}`),
    check("swipe_items_source_ck", sql`${t.url} is not null or ${t.fileId} is not null`),
  ],
);

/** What a link's page said (title, description, picture), kept a day so the same link isn't fetched again. */
export const linkPreviews = pgTable("link_previews", {
  url: text("url").primaryKey(),
  data: jsonb("data").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
});

/** Something shared from a phone's share menu, waiting for its owner to say where it goes. */
export const shareInbox = pgTable("share_inbox", {
  id: id(),
  personId: uuid("person_id")
    .notNull()
    .references(() => people.id),
  url: text("url"),
  title: text("title"),
  text: text("text"),
  fileProvider: text("file_provider").$type<StorageProvider>(),
  fileLocation: text("file_location"),
  fileId: text("file_id"),
  fileName: text("file_name"),
  fileSize: bigint("file_size", { mode: "number" }),
  contentType: text("content_type"),
  createdAt: createdAt(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});
