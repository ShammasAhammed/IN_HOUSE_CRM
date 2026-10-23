// Docs and wiki (Stage 9b.5): team pages (SOPs, playbooks) and client pages (brand notes, logins kept elsewhere),
// nested one under another, with every saved version kept.
import { sql } from "drizzle-orm";
import { bigint, boolean, check, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { MEETING_KINDS, MEETING_REPEATS, STORAGE_PROVIDERS, type DocTableColumn, type DocTableView, type MeetingKind, type MeetingRepeat, type StorageProvider } from "@/lib/types";
import { oneOf } from "./columns";
import { projects, tasks } from "./projects";
import { clients } from "./clients";
import { departments } from "./people";
import { createdAt, id, timestamps } from "./columns";
import { people } from "./people";

export const docs = pgTable(
  "docs",
  {
    id: id(),
    title: text("title").notNull(),
    /** Markdown. */
    body: text("body").notNull().default(""),
    parentId: uuid("parent_id").references((): AnyPgColumn => docs.id),
    /** Null: a team page everyone sees. Set: only people who can see that client. */
    clientId: uuid("client_id").references(() => clients.id),
    position: integer("position").notNull().default(0),
    /** HR slice 3: part of the training library, for a department (null: everyone's training). */
    training: boolean("training").notNull().default(false),
    departmentId: uuid("department_id").references(() => departments.id),
    version: integer("version").notNull().default(1),
    /** Stage 13.4: the words in the page's database tables, so search finds rows too (same trigram index). */
    tableText: text("table_text").notNull().default(""),
    createdById: uuid("created_by_id").references(() => people.id),
    updatedById: uuid("updated_by_id").references(() => people.id),
    ...timestamps(),
  },
  (t) => [index("docs_parent_idx").on(t.parentId).where(sql`${t.deletedAt} is null`), index("docs_client_idx").on(t.clientId).where(sql`${t.deletedAt} is null`)],
);

/** Each saved version of a doc: what it said, who saved it, when. */
export const docVersions = pgTable(
  "doc_versions",
  {
    id: id(),
    docId: uuid("doc_id")
      .notNull()
      .references(() => docs.id),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    editedById: uuid("edited_by_id").references(() => people.id),
    createdAt: createdAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("doc_versions_doc_idx").on(t.docId, t.version)],
);

/** Stage 13.4: pictures in pages, through the storage interface (3.5 MB). */
export const docFiles = pgTable("doc_files", {
  id: id(),
  docId: uuid("doc_id")
    .notNull()
    .references(() => docs.id),
  fileProvider: text("file_provider").$type<StorageProvider>().notNull(),
  fileLocation: text("file_location").notNull(),
  fileId: text("file_id").notNull(),
  contentType: text("content_type").notNull(),
  size: bigint("size", { mode: "number" }).notNull(),
  createdById: uuid("created_by_id").references(() => people.id),
  createdAt: createdAt(),
}, (t) => [check("doc_files_provider_ck", oneOf(t.fileProvider, STORAGE_PROVIDERS))]);

/** Stage 13.4: database tables inside pages. Columns and views here; rows in their own table, readable by tools. */
export const docTables = pgTable(
  "doc_tables",
  {
    id: id(),
    docId: uuid("doc_id")
      .notNull()
      .references(() => docs.id),
    title: text("title").notNull().default("Table"),
    columns: jsonb("columns").$type<DocTableColumn[]>().notNull(),
    view: jsonb("view").$type<DocTableView>().notNull(),
    createdById: uuid("created_by_id").references(() => people.id),
    ...timestamps(),
  },
  (t) => [index("doc_tables_doc_idx").on(t.docId)],
);

export const docTableRows = pgTable(
  "doc_table_rows",
  {
    id: id(),
    tableId: uuid("table_id")
      .notNull()
      .references(() => docTables.id),
    position: integer("position").notNull().default(0),
    cells: jsonb("cells").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdById: uuid("created_by_id").references(() => people.id),
    updatedById: uuid("updated_by_id").references(() => people.id),
    ...timestamps(),
  },
  (t) => [index("doc_table_rows_table_idx").on(t.tableId).where(sql`${t.deletedAt} is null`)],
);

/** Stage 13.4: comments on a line of a page (the quoted words), with @mentions; resolved ones stay in the history. */
export const docComments = pgTable(
  "doc_comments",
  {
    id: id(),
    docId: uuid("doc_id")
      .notNull()
      .references(() => docs.id),
    quote: text("quote"),
    body: text("body").notNull(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => people.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedById: uuid("resolved_by_id").references(() => people.id),
    createdAt: createdAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("doc_comments_doc_idx").on(t.docId).where(sql`${t.deletedAt} is null`)],
);

/** Stage 13.4: a meeting is a page (its notes) plus when, who, what kind and how it repeats. */
export const meetings = pgTable(
  "meetings",
  {
    id: id(),
    docId: uuid("doc_id")
      .notNull()
      .references(() => docs.id),
    clientId: uuid("client_id").references(() => clients.id),
    /** Where its action items become tasks (one of the client's projects), when set. */
    projectId: uuid("project_id").references(() => projects.id),
    kind: text("kind").$type<MeetingKind>().notNull(),
    meetingDate: date("meeting_date").notNull(),
    startTime: text("start_time"),
    attendees: uuid("attendees").array().notNull().default(sql`'{}'::uuid[]`),
    repeat: text("repeat").$type<MeetingRepeat>().notNull().default("none"),
    /** The meeting this one follows on from (a repeating series), and the next one once it's made. */
    previousId: uuid("previous_id").references((): AnyPgColumn => meetings.id),
    nextId: uuid("next_id").references((): AnyPgColumn => meetings.id),
    createdById: uuid("created_by_id").references(() => people.id),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("meetings_doc_uq").on(t.docId),
    index("meetings_client_date_idx").on(t.clientId, t.meetingDate).where(sql`${t.deletedAt} is null`),
    check("meetings_kind_ck", oneOf(t.kind, MEETING_KINDS)),
    check("meetings_repeat_ck", oneOf(t.repeat, MEETING_REPEATS)),
  ],
);

/** Action items already turned into tasks (one task per item). */
export const meetingActions = pgTable(
  "meeting_actions",
  {
    id: id(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id),
    itemKey: text("item_key").notNull(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id),
    createdById: uuid("created_by_id").references(() => people.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("meeting_actions_item_uq").on(t.meetingId, t.itemKey)],
);
