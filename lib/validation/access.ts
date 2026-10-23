import { z } from "zod";
import { CHECKLIST_KINDS } from "../types";
import { id, isoDate, optionalDate, optionalId, optionalText } from "./common";

export const grantAccessSchema = z.object({
  personId: id,
  system: z.string().trim().min(2, { message: "Which tool? e.g. Meta Business Manager." }).max(80),
  account: optionalText(120),
  clientId: optionalId,
  level: optionalText(40),
  grantedOn: isoDate,
  notes: optionalText(300),
});

export const revokeAccessSchema = z.object({ grantId: id, revokedOn: optionalDate });

export const startChecklistSchema = z.object({ personId: id, kind: z.enum(CHECKLIST_KINDS) });
export const checklistDoneSchema = z.object({ itemId: id, done: z.enum(["true", "false"]).transform((v) => v === "true") });
export const addChecklistItemSchema = z.object({
  personId: id,
  kind: z.enum(CHECKLIST_KINDS),
  title: z.string().trim().min(2, { message: "Write the step." }).max(200),
});
export const checklistItemSchema = z.object({ itemId: id });

/** A template typed in a textarea: one step per line. */
export const checklistTemplateSchema = z.object({
  kind: z.enum(CHECKLIST_KINDS),
  items: z
    .string()
    .max(8000)
    .transform((v) => v.split("\n")),
});
