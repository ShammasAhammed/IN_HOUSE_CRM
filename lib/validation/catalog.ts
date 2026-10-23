import { z } from "zod";
import { ROLES } from "../types";
import { id, optionalEnum, optionalText } from "./common";
import { optionalHours } from "./tasks";

const name = (what: string) => z.string().trim().min(2, { message: `Name the ${what}.` }).max(80);
const direction = z.enum(["up", "down"]);
const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("false"), z.literal(""), z.boolean()])
  .optional()
  .transform((v) => v === "on" || v === "true" || v === true);

export const createServiceSchema = z.object({ name: name("service"), description: optionalText(300) });
export const updateServiceSchema = z.object({ serviceId: id, name: name("service"), description: optionalText(300), active: checkbox });
export const moveServiceSchema = z.object({ serviceId: id, direction });

export const addStageSchema = z.object({ serviceId: id, name: name("stage") });
export const renameStageSchema = z.object({ stageId: id, name: name("stage") });
export const moveStageSchema = z.object({ stageId: id, direction });
export const stageIdSchema = z.object({ stageId: id });

const templateFields = {
  title: z.string().trim().min(2, { message: "Give the task a short title." }).max(200),
  stagePosition: z
    .union([z.literal(""), z.coerce.number().int().min(0).max(50)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : Number(v))),
  dueOffsetDays: z.coerce.number({ message: "How many days after the start?" }).int({ message: "Whole days." }).min(0, { message: "0 or more." }).max(365, { message: "At most 365 days." }),
  estimateHours: optionalHours,
  defaultRole: optionalEnum(ROLES),
};
export const addTemplateSchema = z.object({ serviceId: id, ...templateFields });
export const updateTemplateSchema = z.object({ templateId: id, ...templateFields });
export const moveTemplateSchema = z.object({ templateId: id, direction });
export const templateIdSchema = z.object({ templateId: id });

/** Checkbox groups: weekdays 0 (Sunday) – 6, and which Saturdays of a month (1st – 5th) are off. */
export const workWeekSchema = z.object({
  workingWeekdays: z
    .array(z.coerce.number().int().min(0).max(6))
    .min(1, { message: "Pick at least one working day." })
    .transform((v) => [...new Set(v)].sort()),
  saturdaysOff: z
    .array(z.coerce.number().int().min(1).max(5))
    .default([])
    .transform((v) => [...new Set(v)].sort()),
});
