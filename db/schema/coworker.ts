// The AI co-worker (Stage 12.5): its suggestions (posted as cards in a client's or space's chat) and the owner's Monday
// client health digest. A suggestion changes nothing by itself: a person approves, changes, dismisses or snoozes it.
import { sql } from "drizzle-orm";
import { boolean, check, date, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { COWORKER_STATUSES, type CoworkerStatus } from "@/lib/types";
import type { CardAction } from "@/repositories";
import { chatChannels } from "./chat";
import { clients } from "./clients";
import { createdAt, id, oneOf } from "./columns";
import { people } from "./people";

export const coworkerSuggestions = pgTable(
  "coworker_suggestions",
  {
    id: id(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => chatChannels.id),
    /** A problem kind (overdue, blocked…) or "mixed" for the card that gathers the rest. */
    kind: text("kind").notNull(),
    /** What it is about ("overdue:<task id>"): the same thing isn't suggested twice, or again within 7 days of a dismissal. */
    keys: text("keys").array().notNull(),
    title: text("title").notNull(),
    /** The facts behind it, from the data. */
    why: jsonb("why").$type<string[]>().notNull(),
    actions: jsonb("actions").$type<CardAction[]>().notNull(),
    /** The AI's wording, when it was asked; the rules' title otherwise. */
    wording: text("wording"),
    status: text("status").$type<CoworkerStatus>().notNull(),
    /** What happened to each action on approval: ok, or why not. */
    results: jsonb("results").$type<Array<{ ok: boolean; message: string }>>(),
    snoozedUntil: date("snoozed_until"),
    wakeOnClientReply: boolean("wake_on_client_reply").notNull().default(false),
    snoozedAt: timestamp("snoozed_at", { withTimezone: true }),
    decidedById: uuid("decided_by_id").references(() => people.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    day: date("day").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("coworker_client_kind_idx").on(t.clientId, t.kind, t.decidedAt),
    index("coworker_channel_idx").on(t.channelId, t.createdAt),
    index("coworker_snoozed_idx").on(t.snoozedUntil).where(sql`${t.status} = 'snoozed'`),
    index("coworker_keys_idx").using("gin", t.keys),
    check("coworker_status_ck", oneOf(t.status, COWORKER_STATUSES)),
  ],
);

/** The owner's Monday client health digest: one line per client, hours included (owners only ever see it). */
export const coworkerDigests = pgTable("coworker_digests", {
  day: date("day").primaryKey(),
  lines: jsonb("lines").$type<Array<{ clientId: string; clientName: string; light: string; text: string }>>().notNull(),
  createdAt: createdAt(),
});
