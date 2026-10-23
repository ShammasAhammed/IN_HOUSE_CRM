// In-app notifications (Stage 8.1, D82): made from events inside the same transaction, emailed later as a digest.
import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { EntityType } from "@/lib/types";
import { createdAt, id } from "./columns";
import { people } from "./people";

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    /** Where to go in the app. */
    link: text("link"),
    entityType: text("entity_type").$type<EntityType>(),
    entityId: uuid("entity_id"),
    /** Automations set this so running twice never notifies twice. */
    dedupeKey: text("dedupe_key"),
    readAt: timestamp("read_at", { withTimezone: true }),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("notifications_person_idx").on(t.personId, t.createdAt),
    uniqueIndex("notifications_dedupe_uq").on(t.personId, t.dedupeKey).where(sql`${t.dedupeKey} is not null`),
  ],
);
