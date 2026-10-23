import { z } from "zod";
import { DOCUMENT_KINDS } from "../types";
import { id, optionalDate, optionalText } from "./common";

const checkbox = z
  .string()
  .optional()
  .transform((v) => v === "on" || v === "true");

/** The details sent with a file. The file itself is checked by the service (size, real type). */
export const uploadDocumentSchema = z
  .object({
    personId: id,
    kind: z.enum(DOCUMENT_KINDS, { message: "Pick what it is." }),
    // A long run of digits in the title is probably an ID number: keep it out (QA S5-B3).
    title: optionalText(120).refine((v) => !v || !/\d{9,}/.test(v.replace(/[\s-]/g, "")), { message: "Don't put ID numbers in the title. Use the last-4-digits box instead." }),
    expiresOn: optionalDate,
    /** Only the last four digits of an ID number (QA S5-B3); more is refused, never stored. */
    idLast4: z
      .union([z.literal(""), z.string().trim().regex(/^\d{4}$/, { message: "Only the last 4 digits, like 1234." })])
      .optional()
      .transform((v) => v || null),
    /** For an ID proof: the uploader confirms only the last four digits show (NEVER list). */
    masked: checkbox,
  })
  .refine((v) => v.kind !== "id_proof" || v.masked, {
    path: ["masked"],
    message: "Upload a masked ID only: the full Aadhaar number must not show.",
  });

export const updateDocumentSchema = z.object({
  documentId: id,
  title: z
    .string()
    .trim()
    .min(2, { message: "Give it a name." })
    .max(120, { message: "Keep it under 120 characters." })
    .refine((v) => !/\d{9,}/.test(v.replace(/[\s-]/g, "")), { message: "Don't put ID numbers in the title. Use the last-4-digits box instead." }),
  expiresOn: optionalDate,
});

export const documentSchema = z.object({ documentId: id });
