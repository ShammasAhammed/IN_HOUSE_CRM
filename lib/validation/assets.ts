import { z } from "zod";
import { parseTimecode } from "../format";
import { ASSET_KINDS, REVIEW_ACTIONS } from "../types";
import { id, optionalEnum, optionalId, optionalText } from "./common";

const checkbox = z
  .string()
  .optional()
  .transform((v) => v === "on" || v === "true");

/** A link to the work where it lives (Drive, YouTube, Canva, Figma…): https only. */
const optionalLink = z
  .string()
  .trim()
  .max(1000, { message: "That link is too long." })
  .optional()
  .transform((v) => v || null)
  .refine((v) => v === null || (URL.canParse(v) && new URL(v).protocol === "https:"), { message: "Paste a link starting with https://" });

/** A new creative with its first version. The file itself (if any) is checked by the service. */
export const createAssetSchema = z.object({
  clientId: id,
  projectId: optionalId,
  taskId: optionalId,
  title: z.string().trim().min(2, { message: "Give it a name." }).max(160, { message: "Keep it under 160 characters." }),
  kind: optionalEnum(ASSET_KINDS),
  link: optionalLink,
  note: optionalText(500),
  submit: checkbox,
});

export const addVersionSchema = z.object({
  assetId: id,
  link: optionalLink,
  note: optionalText(500),
  submit: checkbox,
});

export const reviewSchema = z.object({
  assetId: id,
  /** The version the reviewer is looking at. */
  versionId: id,
  action: z.enum(REVIEW_ACTIONS, { message: "Pick what happened." }),
  note: optionalText(2000),
});

export const assetCommentSchema = z.object({
  assetId: id,
  versionId: id,
  body: z.string().trim().min(1, { message: "Write a comment." }).max(5000, { message: "Keep it under 5,000 characters." }),
  /** For video: the moment the comment is about, like 1:05. */
  at: z
    .string()
    .optional()
    .refine((v) => !v?.trim() || parseTimecode(v) !== null, { message: "Write the moment like 1:05." })
    .transform((v) => (v?.trim() ? parseTimecode(v) : null)),
});
