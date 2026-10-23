// Client knowledge base (Stage 11.2): what the team and the AI need to work on a client. Tone of voice and do's and
// don'ts (one row per client), past campaigns with what worked, and brand kit files and SOP links (a pointer to the
// file, as on tasks). The client's own Docs pages are listed alongside, not copied.
import { sql } from "drizzle-orm";
import { bigint, check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { KNOWLEDGE_FILE_KINDS, STORAGE_PROVIDERS, type KnowledgeFileKind, type StorageProvider } from "@/lib/types";
import { clients } from "./clients";
import { createdAt, id, oneOf, timestamps, updatedAt } from "./columns";
import { people } from "./people";

export const clientKnowledge = pgTable("client_knowledge", {
  clientId: uuid("client_id")
    .primaryKey()
    .references(() => clients.id),
  tone: text("tone").notNull().default(""),
  dos: text("dos").notNull().default(""),
  donts: text("donts").notNull().default(""),
  /** Brand colours as hex ("#6D28D9"), offered as the sticky palette on Idea Boards (Stage 13.1). */
  brandColours: text("brand_colours").array().notNull().default(sql`'{}'::text[]`),
  /** Two people editing at once: the second save is refused, never silently overwritten. */
  version: integer("version").notNull().default(1),
  updatedById: uuid("updated_by_id").references(() => people.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const clientCampaigns = pgTable(
  "client_campaigns",
  {
    id: id(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    name: text("name").notNull(),
    /** As people say it: "Apr–Jun 2026", "NEET 2026 batch". */
    period: text("period"),
    whatWorked: text("what_worked").notNull(),
    whatToAvoid: text("what_to_avoid"),
    createdById: uuid("created_by_id").references(() => people.id),
    ...timestamps(),
  },
  (t) => [index("client_campaigns_client_idx").on(t.clientId).where(sql`${t.deletedAt} is null`)],
);

export const clientFiles = pgTable(
  "client_files",
  {
    id: id(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    kind: text("kind").$type<KnowledgeFileKind>().notNull(),
    title: text("title").notNull(),
    provider: text("provider").$type<StorageProvider>().notNull(),
    location: text("location").notNull(),
    fileId: text("file_id").notNull(),
    fileName: text("file_name"),
    contentType: text("content_type"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    addedById: uuid("added_by_id").references(() => people.id),
    createdAt: createdAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("client_files_client_idx").on(t.clientId).where(sql`${t.deletedAt} is null`),
    check("client_files_kind_ck", oneOf(t.kind, KNOWLEDGE_FILE_KINDS)),
    check("client_files_provider_ck", oneOf(t.provider, STORAGE_PROVIDERS)),
  ],
);
