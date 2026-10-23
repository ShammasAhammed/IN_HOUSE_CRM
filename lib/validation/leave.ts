import { z } from "zod";
import { HALF_DAYS } from "../types";
import { id, isoDate, optionalEnum, optionalId, optionalText } from "./common";

export const applyLeaveSchema = z
  .object({
    leaveTypeId: id,
    startDate: isoDate,
    endDate: isoDate,
    halfDay: optionalEnum(HALF_DAYS),
    reason: optionalText(500),
    /** HR or the owner recording leave for someone else. */
    forPersonId: optionalId,
  })
  .refine((v) => v.endDate >= v.startDate, { path: ["endDate"], message: "The last day can't be before the first." })
  .refine((v) => !v.halfDay || v.startDate === v.endDate, { path: ["halfDay"], message: "A half day is for a single date." });
export type ApplyLeaveInput = z.input<typeof applyLeaveSchema>;

export const decisionSchema = z.object({
  requestId: id,
  note: optionalText(500),
});

export const revokeSchema = z.object({
  requestId: id,
  note: z.string().trim().min(3, { message: "Say why, so the person understands." }).max(500),
});

export const holidaySchema = z.object({
  date: isoDate,
  name: z.string().trim().min(2, { message: "Name the holiday." }).max(80),
});

export const grantSchema = z.object({
  personId: id,
  leaveTypeId: id,
  /** In days, may be 0.5 steps; negative = take away (HR correction). */
  days: z.coerce
    .number({ message: "Enter a number of days." })
    .refine((d) => d !== 0 && Number.isInteger(d * 2) && Math.abs(d) <= 30, { message: "Use half-day steps, up to 30 days." }),
  reason: z.string().trim().min(3, { message: "Say what it's for." }).max(200),
});

export const quotaSchema = z.object({
  leaveTypeId: id,
  employmentType: z.enum(["full_time", "part_time", "intern", "freelancer"]),
  days: z.coerce
    .number({ message: "Enter a number of days." })
    .refine((d) => d >= 0 && d <= 60 && Number.isInteger(d * 2), { message: "0 to 60 days, in half-day steps." }),
});

/** A new leave type (test report H2): paid with a yearly quota, granted (like comp-off), or unpaid. */
export const leaveTypeSchema = z.object({
  name: z.string().trim().min(2, { message: "Name the leave type." }).max(40),
  kind: z.enum(["quota", "granted", "unpaid"]),
  allowHalfDay: z.literal("on").optional(),
  maxBackdateDays: z.coerce.number().int().min(0, { message: "0 to 30 days." }).max(30, { message: "0 to 30 days." }),
  grantExpiryDays: z.union([z.literal(""), z.coerce.number().int().min(1).max(365)]).optional(),
  full_time: z.union([z.literal(""), z.coerce.number().min(0).max(60)]).optional(),
  part_time: z.union([z.literal(""), z.coerce.number().min(0).max(60)]).optional(),
  intern: z.union([z.literal(""), z.coerce.number().min(0).max(60)]).optional(),
});
