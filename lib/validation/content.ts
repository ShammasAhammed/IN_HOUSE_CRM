import { z } from "zod";
import { CONTENT_CHANNELS, CONTENT_STATUSES } from "../types";
import { id, isoDate, optionalId, optionalText } from "./common";

const optionalTime = z
  .string()
  .trim()
  .optional()
  .transform((v) => v || null)
  .refine((v) => v === null || /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(v), { message: "Write the time like 18:30." });

const optionalHttps = z
  .string()
  .trim()
  .max(1000)
  .optional()
  .transform((v) => v || null)
  .refine((v) => v === null || (URL.canParse(v) && new URL(v).protocol === "https:"), { message: "Paste a link starting with https://" });

const fields = {
  title: z.string().trim().min(2, { message: "Say what it is." }).max(160, { message: "Keep it under 160 characters." }),
  channel: z.enum(CONTENT_CHANNELS, { message: "Pick where it goes out." }),
  publishOn: isoDate,
  publishTime: optionalTime,
  status: z.enum(CONTENT_STATUSES).optional().default("idea"),
  assetId: optionalId,
  ownerId: optionalId,
  caption: optionalText(2200),
  publishedUrl: optionalHttps,
};

/** Published needs the live post's link (QA S4-B1); the message sits on the link field. */
const publishedNeedsLink = <T extends { status?: string; publishedUrl: string | null }>(v: T) => v.status !== "published" || Boolean(v.publishedUrl);
const linkMessage = { path: ["publishedUrl"], message: "Paste the link to the published post." };

export const createContentSchema = z.object({ clientId: id, ...fields }).refine(publishedNeedsLink, linkMessage);
export const updateContentSchema = z.object({ itemId: id, ...fields }).refine(publishedNeedsLink, linkMessage);
export const contentItemSchema = z.object({ itemId: id });
