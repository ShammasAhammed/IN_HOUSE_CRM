import { z } from "zod";
import { EMPLOYMENT_TYPES, ROLES, WORK_LOCATIONS } from "../types";
import { id, isoDate, optionalId, optionalPhone, optionalText } from "./common";

export const personSchema = z.object({
  fullName: z.string().trim().min(2, { message: "Enter the full name." }).max(100),
  workEmail: z.email({ message: "Enter the Google account they sign in with." }).trim().toLowerCase(),
  workPhone: optionalPhone,
  jobTitle: z.string().trim().min(2, { message: "Enter a job title." }).max(80),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  workLocation: z.enum(WORK_LOCATIONS),
  departmentId: optionalId,
  reportsToId: optionalId,
  capacityHoursPerWeek: z.coerce
    .number({ message: "Enter hours per week." })
    .min(0, { message: "Can't be negative." })
    .max(80, { message: "At most 80 hours." }),
  joinDate: isoDate,
  roles: z.array(z.enum(ROLES)).min(1, { message: "Give at least one role." }),
  personalEmail: z
    .union([z.literal(""), z.email({ message: "Enter a valid email." })])
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
  personalPhone: optionalPhone,
  emergencyContactName: optionalText(100),
  emergencyContactPhone: optionalPhone,
  emergencyContactRelation: optionalText(40),
});
export type PersonInput = z.input<typeof personSchema>;

/** What anyone may change about themselves (D50). Only fields that are sent change; "" clears one. */
export const myContactSchema = z
  .object({
    workPhone: optionalPhone,
    personalPhone: optionalPhone,
    personalEmail: z
      .union([z.literal(""), z.email({ message: "Enter a valid email." })])
      .nullable()
      .optional()
      .transform((v) => (v ? v : null)),
    emergencyContactName: optionalText(100),
    emergencyContactPhone: optionalPhone,
    emergencyContactRelation: optionalText(40),
  })
  .partial();

/** Keep only the keys present in the raw input (so an omitted field is left alone, not cleared). */
export function onlySent<T extends Record<string, unknown>>(parsed: T, raw: unknown): Partial<T> {
  const sent = raw && typeof raw === "object" ? Object.keys(raw) : [];
  return Object.fromEntries(Object.entries(parsed).filter(([k]) => sent.includes(k))) as Partial<T>;
}

export const markLeftSchema = z.object({ personId: id, endDate: isoDate });
