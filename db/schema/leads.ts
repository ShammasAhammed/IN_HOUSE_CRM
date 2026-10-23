// Sales leads (Stage 10a, D88): the prospect CRM's leads, now in Oppllo One. Until the switch they are copied one way
// from the CRM's Firestore (crm_id is the Firestore document id); afterwards they are created here.
import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { LEAD_ACTIVITY_TYPES, LEAD_SCORES, LEAD_STAGES, type LeadActivityType, type LeadScore, type LeadStage } from "@/lib/types";
import { clients } from "./clients";
import { createdAt, oneOf, paise, timestamps, id } from "./columns";
import { people } from "./people";

export const leads = pgTable(
  "leads",
  {
    id: id(),
    /** The Firestore document id in the old CRM; null for leads created in Oppllo One. */
    crmId: text("crm_id"),
    /** The id at the source, so a form that sends the same lead twice makes one lead: meta_<id>, google_<id>. */
    externalId: text("external_id"),
    /** The landing page (lead_sources.key) a form lead came from. */
    sourceKey: text("source_key"),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    institution: text("institution"),
    /** The contact's role at the institution (principal, director…). */
    contactRole: text("contact_role"),
    district: text("district"),
    segment: text("segment"),
    problem: text("problem"),
    /** When they want to start. */
    timeline: text("timeline"),
    seats: integer("seats"),
    admissions: integer("admissions"),
    feePaise: paise("fee_paise"),
    spendPaise: paise("spend_paise"),
    commissionPaise: paise("commission_paise"),
    costPerAdmissionPaise: paise("cost_per_admission_paise"),
    stage: text("stage").$type<LeadStage>().notNull(),
    /** The team's own categories, e.g. "NEET", "Malappuram", "Referral partner" (Stage 10b). */
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    score: text("score").$type<LeadScore>(),
    lostReason: text("lost_reason"),
    /** How it arrived: manual, landing, meta_form, google_form… */
    origin: text("origin"),
    /** The channel shown in reports (e.g. "Meta lead form", "Landing page"). */
    channel: text("channel"),
    landing: text("landing"),
    campaign: text("campaign"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmContent: text("utm_content"),
    utmTerm: text("utm_term"),
    ownerId: uuid("owner_id").references(() => people.id),
    /** The CRM's owner name, kept when no person matched. */
    ownerName: text("owner_name"),
    nextFollowUpAt: timestamp("next_follow_up_at", { withTimezone: true }),
    stageChangedAt: timestamp("stage_changed_at", { withTimezone: true }),
    wonAt: timestamp("won_at", { withTimezone: true }),
    lastNoteAt: timestamp("last_note_at", { withTimezone: true }),
    /** Form answers that have no column of their own. */
    answers: jsonb("answers").$type<Record<string, string>>(),
    /** Everything else from the source, untouched: ad ids, click ids, the landing assistant's conversation, conversions sent. */
    details: jsonb("details").$type<Record<string, unknown>>(),
    clientId: uuid("client_id").references(() => clients.id),
    copiedAt: timestamp("copied_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("leads_crm_id_uq").on(t.crmId),
    uniqueIndex("leads_external_id_uq").on(t.externalId),
    index("leads_stage_idx").on(t.stage, t.createdAt),
    index("leads_owner_idx").on(t.ownerId),
    index("leads_tags_idx").using("gin", t.tags),
    index("leads_follow_up_idx").on(t.nextFollowUpAt).where(sql`${t.deletedAt} is null`),
    check("leads_stage_ck", oneOf(t.stage, LEAD_STAGES)),
    check("leads_score_ck", sql`${t.score} is null or ${oneOf(t.score, LEAD_SCORES)}`),
  ],
);

/** A lead's timeline: stage changes, notes, follow-ups, assignments, edits. Never edited, never deleted. */
export const leadActivities = pgTable(
  "lead_activities",
  {
    id: id(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id),
    /** The Firestore id of the activity in the old CRM, so copying twice never duplicates. */
    crmId: text("crm_id"),
    type: text("type").$type<LeadActivityType>().notNull(),
    text: text("text").notNull(),
    fromStage: text("from_stage"),
    toStage: text("to_stage"),
    byId: uuid("by_id").references(() => people.id),
    byName: text("by_name"),
    at: timestamp("at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("lead_activities_crm_id_uq").on(t.crmId), index("lead_activities_lead_idx").on(t.leadId, t.at), check("lead_activities_type_ck", oneOf(t.type, LEAD_ACTIVITY_TYPES))],
);

/**
 * Landing pages that send their forms to Oppllo One (POST /api/lead/<key>). Keys are copied from the CRM's sources, so
 * a page keeps its key on switch day and only the address it posts to changes.
 */
export const leadSources = pgTable("lead_sources", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  url: text("url"),
  /** Shown as the lead's channel; "Landing page" when empty. */
  channel: text("channel"),
  active: boolean("active").notNull().default(true),
  leadCount: integer("lead_count").notNull().default(0),
  lastLeadAt: timestamp("last_lead_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Conversions waiting for Google Ads' daily offline import (GET /api/google-conversions), once per lead and stage. */
export const googleConversions = pgTable(
  "google_conversions",
  {
    id: id(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id),
    stage: text("stage").$type<LeadStage>().notNull(),
    gclid: text("gclid").notNull(),
    name: text("name").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull(),
    valuePaise: paise("value_paise"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("google_conversions_lead_stage_uq").on(t.leadId, t.stage), index("google_conversions_at_idx").on(t.at)],
);

/** A person's saved Leads filters, shown as one-tap buttons (Stage 10b). */
export const leadViews = pgTable(
  "lead_views",
  {
    id: id(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    name: text("name").notNull(),
    /** The Leads screen's query string, e.g. "stage=open&tag=NEET&due=overdue". */
    query: text("query").notNull(),
    createdAt: createdAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("lead_views_person_idx").on(t.personId)],
);
