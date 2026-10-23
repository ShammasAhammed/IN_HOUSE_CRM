// Chat (Stage 12.1): the team talks where the work is. A client channel belongs to a client or a space and is seen by
// exactly the people who see that client (clientScope: private spaces only by live members). Team channels and direct
// messages are seen by their members. A task's chat is its comments (task_comments), not stored again here.
// Messages are not events (there are too many); channel and membership changes are.
import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { CHAT_KINDS, STORAGE_PROVIDERS, type ChatKind, type StorageProvider } from "@/lib/types";
import { clients } from "./clients";
import { createdAt, id, oneOf, updatedAt } from "./columns";
import { people } from "./people";
import { portalUsers } from "./portal";

export const chatChannels = pgTable(
  "chat_channels",
  {
    id: id(),
    kind: text("kind").$type<ChatKind>().notNull(),
    /** For client channels: the client or space. */
    clientId: uuid("client_id").references(() => clients.id),
    /** Team channels have a name; client channels use the client's; direct messages list their people. */
    name: text("name"),
    createdById: uuid("created_by_id").references(() => people.id),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("chat_channels_client_uq").on(t.clientId).where(sql`${t.kind} = 'client'`),
    // Stage 12.6: one chat per client shared with that client's portal users.
    uniqueIndex("chat_channels_shared_uq").on(t.clientId).where(sql`${t.kind} = 'shared'`),
    check("chat_channels_kind_ck", oneOf(t.kind, CHAT_KINDS)),
    check("chat_channels_client_ck", sql`(${t.kind} in ('client', 'shared')) = (${t.clientId} is not null)`),
  ],
);

/** Who is in a team channel or a direct message (client channels follow the client's visibility instead). */
export const chatMembers = pgTable(
  "chat_members",
  {
    channelId: uuid("channel_id")
      .notNull()
      .references(() => chatChannels.id),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    addedById: uuid("added_by_id").references(() => people.id),
    createdAt: createdAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.channelId, t.personId] }), index("chat_members_person_idx").on(t.personId)],
);

/** How far each person has read in each channel: unread counts are messages after this. */
export const chatReads = pgTable(
  "chat_reads",
  {
    channelId: uuid("channel_id")
      .notNull()
      .references(() => chatChannels.id),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.channelId, t.personId] })],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: id(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => chatChannels.id),
    /** A person at Oppllo, or (in a chat shared with the client, 12.6) the client's portal user. Exactly one. */
    authorId: uuid("author_id").references(() => people.id),
    portalUserId: uuid("portal_user_id").references(() => portalUsers.id),
    body: text("body").notNull(),
    /** People @mentioned who may see the channel (they were notified). */
    mentions: uuid("mentions").array().notNull().default(sql`'{}'::uuid[]`),
    /** An attachment: a pointer to the file through the storage interface, or an outside link. */
    fileProvider: text("file_provider").$type<StorageProvider>(),
    fileLocation: text("file_location"),
    fileId: text("file_id"),
    fileName: text("file_name"),
    fileType: text("file_type"),
    fileSize: bigint("file_size", { mode: "number" }),
    createdAt: createdAt(),
    /** Touched on every change (new, edit, removal): the conversation checks for changes after its last look. */
    updatedAt: updatedAt(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    /** An AI answer (Stage 12.2): the @AI question it answers. Its author is the person who asked. */
    aiReplyTo: uuid("ai_reply_to").references((): AnyPgColumn => chatMessages.id),
    /** A co-worker card (Stage 12.5): the suggestion this message shows. */
    coworkerId: uuid("coworker_id"),
  },
  (t) => [
    // One answer per question, even when the button is pressed twice.
    uniqueIndex("chat_messages_ai_reply_idx").on(t.aiReplyTo).where(sql`${t.aiReplyTo} is not null`),
    index("chat_messages_channel_idx").on(t.channelId, t.createdAt),
    index("chat_messages_changes_idx").on(t.channelId, t.updatedAt),
    check("chat_messages_author_ck", sql`(${t.authorId} is null) <> (${t.portalUserId} is null)`),
    check("chat_messages_body_ck", sql`length(${t.body}) <= 4000 and (length(${t.body}) >= 1 or ${t.fileId} is not null)`),
    check("chat_messages_file_ck", sql`${t.fileProvider} is null or ${oneOf(t.fileProvider, STORAGE_PROVIDERS)}`),
  ],
);

/** What a client's portal user has read in their shared chat, and when they were last emailed about it (12.6). */
export const chatPortalReads = pgTable(
  "chat_portal_reads",
  {
    channelId: uuid("channel_id")
      .notNull()
      .references(() => chatChannels.id),
    portalUserId: uuid("portal_user_id")
      .notNull()
      .references(() => portalUsers.id),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
    alertedAt: timestamp("alerted_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.channelId, t.portalUserId] })],
);
