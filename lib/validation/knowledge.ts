import { z } from "zod";
import { KNOWLEDGE_FILE_KINDS } from "../types";
import { id, optionalText } from "./common";

const box = (max: number) => z.string().trim().max(max, { message: `Keep it under ${max.toLocaleString("en-IN")} characters.` }).optional().default("");

export const knowledgeSchema = z.object({
  clientId: id,
  version: z.coerce.number().int().min(0),
  tone: box(2000),
  dos: box(4000),
  donts: box(4000),
  /** Brand colours as hex, comma or space between ("#6D28D9, #F59F00"): the sticky palette on Idea Boards. */
  brandColours: z
    .string()
    .optional()
    .default("")
    .transform((s) => [...new Set(s.split(/[\s,]+/).filter(Boolean).map((c) => (c.startsWith("#") ? c : `#${c}`).toLowerCase()))])
    .refine((a) => a.length <= 8, { message: "Up to 8 colours." })
    .refine((a) => a.every((c) => /^#[0-9a-f]{6}$/.test(c)), { message: "Use six-digit hex colours, like #6D28D9." }),
});

export const campaignSchema = z.object({
  clientId: id,
  name: z.string().trim().min(1, { message: "Give the campaign a name." }).max(120, { message: "Keep the name under 120 characters." }),
  period: optionalText(60),
  whatWorked: z.string().trim().min(1, { message: "Say what worked: the point of keeping it." }).max(2000, { message: "Keep it under 2,000 characters." }),
  whatToAvoid: optionalText(2000),
});

export const clientFileSchema = z.object({
  clientId: id,
  kind: z.enum(KNOWLEDGE_FILE_KINDS, { message: "Pick what it is." }),
  title: z.string().trim().max(120, { message: "Keep the name under 120 characters." }).optional().transform((v) => v || null),
  link: z
    .string()
    .trim()
    .max(1000, { message: "That link is too long." })
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || (URL.canParse(v) && new URL(v).protocol === "https:"), { message: "Paste a link starting with https://" }),
});
