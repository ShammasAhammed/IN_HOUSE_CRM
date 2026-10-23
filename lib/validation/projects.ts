import { z } from "zod";
import { PROJECT_STATUSES } from "../types";
import { id, isoDate, optionalDate, optionalId, optionalText } from "./common";

export const createProjectSchema = z
  .object({
    clientId: id,
    engagementId: optionalId,
    name: z.string().trim().min(2, { message: "Name the project." }).max(120),
    description: optionalText(2000),
    leadId: optionalId,
    startDate: isoDate,
    dueDate: optionalDate,
    /** "on" from a checkbox. */
    starterTasks: z
      .union([z.literal("on"), z.literal("1"), z.literal(""), z.boolean()])
      .optional()
      .transform((v) => v === "on" || v === "1" || v === true),
  })
  .refine((v) => !v.dueDate || v.dueDate >= v.startDate, { path: ["dueDate"], message: "The end can't be before the start." });

export const projectStatusSchema = z.object({ projectId: id, status: z.enum(PROJECT_STATUSES) });
export const projectStageSchema = z.object({ projectId: id, stageId: id });
