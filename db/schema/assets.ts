import { sql } from "drizzle-orm";
import { bigint, check, date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import {
  APPROVAL_STATES,
  ASSET_KINDS,
  CONTENT_CHANNELS,
  CONTENT_STATUSES,
  REVIEW_ACTIONS,
  STORAGE_PROVIDERS,
  type ApprovalState,
  type AssetKind,
  type ContentChannel,
  type ContentStatus,
  type ReviewAction,
  type StorageProvider,
} from "@/lib/types";
import { createdAt, id, oneOf, timestamps } from "./columns";
import { clients } from "./clients";
import { people } from "./people";
import { portalUsers } from "./portal";
import { projects, tasks } from "./projects";

/** A creative file with versions and an approval state. */
export const assets = pgTable(
  "assets",
  {
    id: id(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    projectId: uuid("project_id").references(() => projects.id),
    taskId: uuid("task_id").references(() => tasks.id),
    title: text("title").notNull(),
    kind: text("kind").$type<AssetKind>().notNull(),
    approvalState: text("approval_state").$type<ApprovalState>().notNull().default("draft"),
    currentVersion: integer("current_version").notNull().default(0),
    approvedVersionId: uuid("approved_version_id").references((): AnyPgColumn => assetVersions.id),
    approvedById: uuid("approved_by_id").references(() => people.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdById: uuid("created_by_id").references(() => people.id),
    ...timestamps(),
  },
  (t) => [
    index("assets_client_idx").on(t.clientId),
    index("assets_project_idx").on(t.projectId),
    index("assets_task_idx").on(t.taskId),
    check("assets_kind_ck", oneOf(t.kind, ASSET_KINDS)),
    check("assets_approval_ck", oneOf(t.approvalState, APPROVAL_STATES)),
  ],
);

/**
 * One version of an asset. Stores a pointer, never the file (Projects module, rule 3):
 * which provider, which bucket or folder, which file id. Swapping Drive for R2 changes a setting, not data.
 */
export const assetVersions = pgTable(
  "asset_versions",
  {
    id: id(),
    assetId: uuid("asset_id")
      .notNull()
      .references((): AnyPgColumn => assets.id),
    version: integer("version").notNull(),
    storageProvider: text("storage_provider").$type<StorageProvider>().notNull(),
    storageLocation: text("storage_location").notNull(),
    storageFileId: text("storage_file_id").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    note: text("note"),
    uploadedById: uuid("uploaded_by_id").references(() => people.id),
    createdAt: createdAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("asset_versions_uq").on(t.assetId, t.version),
    check("asset_versions_provider_ck", oneOf(t.storageProvider, STORAGE_PROVIDERS)),
    check("asset_versions_version_ck", sql`${t.version} > 0`),
  ],
);

/**
 * A version's thread: comments, and the review steps taken on it (sent for review, changes asked, approved…) with
 * their notes. For video, a comment can point at a moment (`atSeconds`), which is enough without a video tool (plan/3).
 */
export const assetComments = pgTable(
  "asset_comments",
  {
    id: id(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id),
    versionId: uuid("version_id")
      .notNull()
      .references(() => assetVersions.id),
    /** Staff author; null when a client wrote it through the portal (Stage 11.6). */
    authorId: uuid("author_id").references(() => people.id),
    /** The client contact who wrote it in the portal; the portal shows clients only these, never staff comments. */
    portalUserId: uuid("portal_user_id").references(() => portalUsers.id),
    /** Set when this entry records a review step; the body is then its note (may be empty). */
    action: text("action").$type<ReviewAction>(),
    body: text("body").notNull(),
    atSeconds: integer("at_seconds"),
    createdAt: createdAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("asset_comments_asset_idx").on(t.assetId, t.createdAt),
    check("asset_comments_action_ck", sql`${t.action} is null or ${oneOf(t.action, REVIEW_ACTIONS)}`),
    check("asset_comments_body_ck", sql`length(${t.body}) <= 5000 and (${t.action} is not null or length(${t.body}) >= 1)`),
    check("asset_comments_at_ck", sql`${t.atSeconds} is null or ${t.atSeconds} >= 0`),
    check("asset_comments_author_ck", sql`(${t.authorId} is null) <> (${t.portalUserId} is null)`),
  ],
);

/**
 * A planned post or ad on a client's content calendar (Stage 7.3, D81): when and where it goes out, the creative it
 * uses, and how far along it is (idea → published). When its creative is approved it becomes ready to publish.
 */
export const contentItems = pgTable(
  "content_items",
  {
    id: id(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    title: text("title").notNull(),
    channel: text("channel").$type<ContentChannel>().notNull(),
    /** The day it goes out (India). */
    publishOn: date("publish_on").notNull(),
    /** "18:30", India time, when it matters. */
    publishTime: text("publish_time"),
    status: text("status").$type<ContentStatus>().notNull().default("idea"),
    assetId: uuid("asset_id").references(() => assets.id),
    ownerId: uuid("owner_id").references(() => people.id),
    caption: text("caption"),
    /** The live post, once published. */
    publishedUrl: text("published_url"),
    createdById: uuid("created_by_id").references(() => people.id),
    ...timestamps(),
  },
  (t) => [
    index("content_items_client_idx").on(t.clientId, t.publishOn).where(sql`${t.deletedAt} is null`),
    index("content_items_asset_idx").on(t.assetId).where(sql`${t.deletedAt} is null`),
    check("content_items_channel_ck", oneOf(t.channel, CONTENT_CHANNELS)),
    check("content_items_status_ck", oneOf(t.status, CONTENT_STATUSES)),
    check("content_items_time_ck", sql`${t.publishTime} is null or ${t.publishTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
  ],
);
