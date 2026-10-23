// Template gallery (Stage 13.6): boards and Docs pages saved as templates (cleaned of client data when saved), and
// presets (colour palettes, sticky styles, layouts). Company templates are shared with the team and approved by a
// strategist or the owner; "mine" are seen only by the person who saved them.
import { sql } from "drizzle-orm";
import { boolean, check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { GALLERY_KINDS, GALLERY_SCOPES, PRESET_KINDS, type GalleryKind, type GalleryScope, type PresetKind, type PresetValue } from "@/lib/types";
import { createdAt, id, oneOf, updatedAt } from "./columns";
import { people } from "./people";

export const galleryTemplates = pgTable(
  "gallery_templates",
  {
    id: id(),
    kind: text("kind").$type<GalleryKind>().notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    scope: text("scope").$type<GalleryScope>().notNull(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => people.id),
    approved: boolean("approved").notNull().default(false),
    approvedById: uuid("approved_by_id").references(() => people.id),
    /** Boards: a small PNG (data URL) of the cleaned scene. */
    thumbnail: text("thumbnail"),
    /** The first lines of a page, or a board's first stickies: shown when there's no picture, and searched. */
    preview: text("preview").notNull().default(""),
    /** Boards: { elements, appState }. Pages: { body, tables: [{ id, title, columns, view, rows }] }. */
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("gallery_templates_kind_idx").on(t.kind).where(sql`${t.deletedAt} is null`),
    check("gallery_templates_kind_ck", oneOf(t.kind, GALLERY_KINDS)),
    check("gallery_templates_scope_ck", oneOf(t.scope, GALLERY_SCOPES)),
  ],
);

/** Each use of a template (saved or built-in, by its key), for "most used". */
export const galleryUses = pgTable(
  "gallery_uses",
  {
    id: id(),
    templateKey: text("template_key").notNull(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    createdAt: createdAt(),
  },
  (t) => [index("gallery_uses_key_idx").on(t.templateKey)],
);

export const presets = pgTable(
  "presets",
  {
    id: id(),
    kind: text("kind").$type<PresetKind>().notNull(),
    name: text("name").notNull(),
    value: jsonb("value").$type<PresetValue>().notNull(),
    scope: text("scope").$type<GalleryScope>().notNull(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => people.id),
    createdAt: createdAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [check("presets_kind_ck", oneOf(t.kind, PRESET_KINDS)), check("presets_scope_ck", oneOf(t.scope, GALLERY_SCOPES))],
);
