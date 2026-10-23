import { z } from "zod";
import { RECURRENCE_FREQUENCIES, TASK_PRIORITIES } from "../types";
import { id, isoDate, optionalDate, optionalEnum, optionalId, optionalText } from "./common";
import { optionalHours } from "./tasks";

const optionalInt = (min: number, max: number, message: string) =>
  z
    .union([z.literal(""), z.coerce.number().int({ message }).min(min, { message }).max(max, { message })])
    .nullable()
    .optional()
    .transform((v) => (v === "" || v === null || v === undefined ? null : Number(v)));

const fields = {
  title: z.string().trim().min(2, { message: "Give the task a short title." }).max(200),
  description: optionalText(5000),
  ownerId: optionalId,
  reviewerId: optionalId,
  priority: optionalEnum(TASK_PRIORITIES).transform((v) => v ?? "normal"),
  stageId: optionalId,
  deliverableId: optionalId,
  estimateHours: optionalHours,
  frequency: z.enum(RECURRENCE_FREQUENCIES, { message: "Weekly or monthly?" }),
  weekday: optionalInt(1, 6, "Pick a day from Monday to Saturday."),
  /** 1–28, or 31 for the last working day. */
  dayOfMonth: optionalInt(1, 31, "Pick a day of the month.").refine((v) => v === null || v <= 28 || v === 31, {
    message: "Pick a day from 1 to 28, or the last working day.",
  }),
  leadWorkingDays: z.coerce.number({ message: "How many days before?" }).int().min(0).max(10, { message: "At most 10 working days." }).default(1),
  startsOn: isoDate,
  endsOn: optionalDate,
};

/** Weekly needs a weekday, monthly a day; the other one is cleared. */
const shaped = <T extends z.ZodType<{ frequency: "weekly" | "monthly"; weekday: number | null; dayOfMonth: number | null; startsOn: string; endsOn: string | null }>>(s: T) =>
  s
    .refine((v) => v.frequency !== "weekly" || v.weekday !== null, { path: ["weekday"], message: "Pick the day of the week." })
    .refine((v) => v.frequency !== "monthly" || v.dayOfMonth !== null, { path: ["dayOfMonth"], message: "Pick the day of the month." })
    .refine((v) => !v.endsOn || v.endsOn >= v.startsOn, { path: ["endsOn"], message: "The end can't be before the start." })
    .transform((v) => ({ ...v, weekday: v.frequency === "weekly" ? v.weekday : null, dayOfMonth: v.frequency === "monthly" ? v.dayOfMonth : null }));

export const createRecurrenceSchema = shaped(z.object({ ...fields, projectId: id }));
export const updateRecurrenceSchema = shaped(z.object({ ...fields, recurrenceId: id }));
export const recurrenceActiveSchema = z.object({ recurrenceId: id, active: z.enum(["true", "false"]).transform((v) => v === "true") });
export const recurrenceIdSchema = z.object({ recurrenceId: id });
