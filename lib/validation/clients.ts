import { z } from "zod";
import { CLIENT_SEGMENTS, CLIENT_STATUSES } from "../types";
import { id, optionalDate, optionalId, optionalPhone, optionalText } from "./common";

/** 15 characters: state code, PAN, entity number, Z, check character. */
const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const clientSchema = z.object({
  name: z.string().trim().min(2, { message: "Please enter the client's name." }).max(120, { message: "Keep the name under 120 characters." }),
  legalName: optionalText(160),
  segment: z.enum(CLIENT_SEGMENTS, { message: "Pick a segment." }),
  city: optionalText(80),
  status: z.enum(CLIENT_STATUSES, { message: "Pick a status." }),
  startDate: optionalDate,
  gstin: z
    .union([z.literal(""), z.string().trim().toUpperCase().regex(GSTIN, { message: "A GSTIN is 15 characters, like 32ABCDE1234F1Z5." })])
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
  billingAddress: optionalText(500),
  crmLeadId: optionalText(64),
  leadStrategistId: optionalId,
  notes: optionalText(2000),
  driveFolderUrl: z
    .union([z.literal(""), z.string().trim().max(500).refine((v) => URL.canParse(v) && new URL(v).protocol === "https:", { message: "Paste a link starting with https://" })])
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
});
export type ClientInput = z.input<typeof clientSchema>;

const checkbox = z
  .union([z.literal("on"), z.literal("1"), z.literal(""), z.boolean()])
  .optional()
  .transform((v) => v === "on" || v === "1" || v === true);

export const contactSchema = z.object({
  name: z.string().trim().min(2, { message: "Enter their name." }).max(80),
  designation: optionalText(80),
  phone: optionalPhone,
  email: z
    .union([z.literal(""), z.email({ message: "Enter a valid email." }).trim().toLowerCase()])
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
  whatsapp: optionalPhone,
  isPrimary: checkbox,
});

export const addContactSchema = contactSchema.extend({ clientId: id });
export const updateContactSchema = contactSchema.extend({ contactId: id });
export const memberSchema = z.object({ clientId: id, personId: id });
