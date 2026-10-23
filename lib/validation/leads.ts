import { z } from "zod";
import { LEAD_LOST_REASONS, LEAD_SCORES, LEAD_STAGES } from "../types";
import { id, optionalEnum, optionalText } from "./common";

const text = (max: number) => optionalText(max);

export const leadFieldsSchema = z.object({
  name: z.string().trim().min(1, { message: "Give the contact's name." }).max(200),
  phone: text(40),
  email: z.union([z.literal(""), z.email({ message: "That email doesn't look right." })]).optional().transform((v) => v || null),
  institution: text(200),
  contactRole: text(100),
  district: text(100),
  segment: text(100),
  channel: text(100),
  score: optionalEnum(LEAD_SCORES),
  problem: text(1000),
});

export const createLeadSchema = leadFieldsSchema;
export const updateLeadSchema = leadFieldsSchema.extend({ leadId: id });
export const leadStageSchema = z
  .object({ leadId: id, stage: z.enum(LEAD_STAGES), lostReason: optionalEnum(LEAD_LOST_REASONS) })
  .refine((v) => v.stage !== "lost" || v.lostReason, { path: ["lostReason"], message: "Pick why it was lost." });
export const leadOwnerSchema = z.object({ leadId: id, ownerId: z.union([z.literal(""), id]).transform((v) => v || null) });
export const leadNoteSchema = z.object({ leadId: id, text: z.string().trim().min(1, { message: "Write the note first." }).max(5000) });
/** A local date-time from the form ("2026-10-16T10:30"), read as India time; empty clears it. */
export const leadFollowUpSchema = z.object({
  leadId: id,
  at: z
    .union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, { message: "Pick a date and time." })])
    .transform((v) => (v ? new Date(`${v}:00+05:30`) : null)),
});

/** Tags typed as "NEET, Malappuram": trimmed, at most 10 per lead, each up to 30 characters. */
export const tagList = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : v.split(",")))
  .transform((xs) => xs.map((t) => t.trim().replace(/\s+/g, " ")).filter(Boolean))
  .refine((xs) => xs.every((t) => t.length <= 30), { message: "Keep each tag under 30 characters." })
  .refine((xs) => xs.length <= 10, { message: "At most 10 tags on a lead." });

export const leadTagsSchema = z.object({ leadId: id, tags: tagList });

export const BULK_ACTIONS = ["stage", "owner", "tag_add", "tag_remove", "follow_up"] as const;
export const bulkLeadSchema = z
  .object({
    ids: z.array(id).min(1, { message: "Pick at least one lead." }).max(200, { message: "At most 200 leads at a time." }),
    action: z.enum(BULK_ACTIONS),
    stage: z.enum(LEAD_STAGES).optional(),
    lostReason: optionalEnum(LEAD_LOST_REASONS),
    ownerId: z.union([z.literal(""), id]).optional(),
    tag: z.string().trim().max(30).optional(),
    at: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)]).optional(),
  })
  .refine((v) => v.action !== "stage" || v.stage, { path: ["stage"], message: "Pick a stage." })
  .refine((v) => v.action !== "stage" || v.stage !== "lost" || v.lostReason, { path: ["lostReason"], message: "Pick why they were lost." })
  .refine((v) => !v.action.startsWith("tag") || v.tag, { path: ["tag"], message: "Type a tag." });
