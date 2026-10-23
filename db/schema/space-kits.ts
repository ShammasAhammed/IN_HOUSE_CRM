// Space kits (Stage 14.4): what a kit made in a space, item by item, so applying it again adds only what's missing.
import { index, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { clients } from "./clients";
import { people } from "./people";

export const spaceKitItems = pgTable(
  "space_kit_items",
  {
    spaceId: uuid("space_id")
      .notNull()
      .references(() => clients.id),
    kit: text("kit").notNull(),
    /** The kit's own name for the item ("gst_r1"). */
    itemKey: text("item_key").notNull(),
    /** What it became: project, task_recurrence, task, doc, goal or board, and its id. */
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    createdById: uuid("created_by_id").references(() => people.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.spaceId, t.kit, t.itemKey] }), index("space_kit_items_space_idx").on(t.spaceId)],
);
