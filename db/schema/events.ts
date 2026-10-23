import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { ENTITY_TYPES, type EntityType } from "@/lib/types";
import { id, oneOf } from "./columns";
import { people } from "./people";

/**
 * Every change, as a record: who, what, when. Automations, notifications, the audit trail and the AI
 * read from this stream instead of being wired into each other (Projects module, rule 2). Append-only.
 */
export const events = pgTable(
  "events",
  {
    id: id(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    /** Null when the system did it (a scheduled job). */
    actorId: uuid("actor_id").references(() => people.id),
    /** "task.completed", "leave.approved" … */
    action: text("action").notNull(),
    entityType: text("entity_type").$type<EntityType>().notNull(),
    entityId: uuid("entity_id").notNull(),
    /** Set when the event concerns a client, so the client page can show its history in one query. */
    clientId: uuid("client_id"),
    /** Set when the event concerns a person (HR), for the same reason. */
    personId: uuid("person_id"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [
    index("events_entity_idx").on(t.entityType, t.entityId, t.occurredAt),
    index("events_client_idx").on(t.clientId, t.occurredAt).where(sql`${t.clientId} is not null`),
    index("events_person_idx").on(t.personId, t.occurredAt).where(sql`${t.personId} is not null`),
    index("events_occurred_idx").on(t.occurredAt),
    check("events_entity_type_ck", oneOf(t.entityType, ENTITY_TYPES)),
  ],
);
