// Idea Boards (Stage 13.1): a canvas per client, project or space. The scene is Excalidraw's own JSON (elements and a
// few settings), kept as data so a move to another engine is a conversion, not a rebuild (D-13.1a). Everything around
// it is ours: sections, tags, favourites, versions, votes, reactions, comments and images.
import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { BOARD_TEMPLATES, STORAGE_PROVIDERS, type BoardScene, type BoardTemplate, type BoardTimer, type BoardVoting, type StorageProvider } from "@/lib/types";
import { clients } from "./clients";
import { createdAt, id, oneOf, updatedAt } from "./columns";
import { people } from "./people";
import { projects, tasks } from "./projects";

export const boards = pgTable(
  "boards",
  {
    id: id(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    projectId: uuid("project_id").references(() => projects.id),
    title: text("title").notNull(),
    /** A folder name inside the client or space ("Campaign ideas", "Retros"); null = no section. */
    section: text("section"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    scene: jsonb("scene").$type<BoardScene>().notNull(),
    /** Two people saving at once: the second save is refused, never silently overwritten. */
    version: integer("version").notNull().default(1),
    /** Every text on the board, for search and the List view. */
    searchText: text("search_text").notNull().default(""),
    objectCount: integer("object_count").notNull().default(0),
    sceneBytes: integer("scene_bytes").notNull().default(0),
    /** A small PNG (data URL) made in the browser on save. */
    thumbnail: text("thumbnail"),
    template: text("template").$type<BoardTemplate>(),
    voting: jsonb("voting").$type<BoardVoting>(),
    timer: jsonb("timer").$type<BoardTimer>(),
    createdById: uuid("created_by_id").references(() => people.id),
    updatedById: uuid("updated_by_id").references(() => people.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    /** Archive is the soft delete; restore clears it. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("boards_client_idx").on(t.clientId).where(sql`${t.archivedAt} is null`),
    index("boards_project_idx").on(t.projectId).where(sql`${t.projectId} is not null`),
    check("boards_template_ck", sql`${t.template} is null or ${oneOf(t.template, BOARD_TEMPLATES)}`),
  ],
);

/** Favourites and "recently opened", per person. */
export const boardPeople = pgTable(
  "board_people",
  {
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    favourite: boolean("favourite").notNull().default(false),
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.boardId, t.personId] }), index("board_people_person_idx").on(t.personId)],
);

/** Version history: automatic (name null) and named snapshots ("Before client review"). */
export const boardVersions = pgTable(
  "board_versions",
  {
    id: id(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id),
    version: integer("version").notNull(),
    scene: jsonb("scene").$type<BoardScene>().notNull(),
    name: text("name"),
    objectCount: integer("object_count").notNull().default(0),
    createdById: uuid("created_by_id").references(() => people.id),
    createdAt: createdAt(),
  },
  (t) => [index("board_versions_board_idx").on(t.boardId, t.createdAt)],
);

/** Dot votes on stickies, per voting round; taking a vote back sets deleted_at. */
export const boardVotes = pgTable(
  "board_votes",
  {
    id: id(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id),
    round: integer("round").notNull(),
    elementId: text("element_id").notNull(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    createdAt: createdAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("board_votes_board_idx").on(t.boardId, t.round).where(sql`${t.deletedAt} is null`)],
);

/** Emoji reactions on stickies and shapes, one per person per emoji. */
export const boardReactions = pgTable(
  "board_reactions",
  {
    id: id(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id),
    elementId: text("element_id").notNull(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    emoji: text("emoji").notNull(),
    createdAt: createdAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("board_reactions_board_idx").on(t.boardId).where(sql`${t.deletedAt} is null`)],
);

/** Comments, pinned to a sticky (element id) or on the whole board. */
export const boardComments = pgTable(
  "board_comments",
  {
    id: id(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id),
    elementId: text("element_id"),
    authorId: uuid("author_id")
      .notNull()
      .references(() => people.id),
    body: text("body").notNull(),
    createdAt: createdAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("board_comments_board_idx").on(t.boardId).where(sql`${t.deletedAt} is null`)],
);

/** Images on a board, through the storage interface; the scene keeps only Excalidraw's file id. */
export const boardFiles = pgTable(
  "board_files",
  {
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id),
    fileKey: text("file_key").notNull(),
    contentType: text("content_type").notNull(),
    fileProvider: text("file_provider").$type<StorageProvider>().notNull(),
    fileLocation: text("file_location").notNull(),
    fileId: text("file_id").notNull(),
    fileSize: bigint("file_size", { mode: "number" }).notNull(),
    createdById: uuid("created_by_id").references(() => people.id),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.boardId, t.fileKey] }), check("board_files_provider_ck", oneOf(t.fileProvider, STORAGE_PROVIDERS))],
);

/** Stage 13.2: a sticky turned into a task (one task per sticky). */
export const boardTaskLinks = pgTable(
  "board_task_links",
  {
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id),
    elementId: text("element_id").notNull(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id),
    createdById: uuid("created_by_id").references(() => people.id),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.boardId, t.elementId] })],
);
