import { z } from "zod";
import { TASK_PERSON_ROLES, TASK_PRIORITIES, TASK_STATUSES } from "../types";
import { id, isoDate, optionalDate, optionalEnum, optionalId, optionalText } from "./common";
/** Hours typed in a form ("1.5") → whole minutes, or null. */
export const optionalHours = z
  .union([z.literal(""), z.coerce.number().min(0, { message: "Can't be negative." }).max(200, { message: "At most 200 hours." })])
  .nullable()
  .optional()
  .transform((v) => (v === "" || v === null || v === undefined ? null : Math.round(Number(v) * 60)));

export const taskFields = {
  title: z.string().trim().min(2, { message: "Give the task a short title." }).max(200),
  description: optionalText(5000),
  ownerId: optionalId,
  reviewerId: optionalId,
  stageId: optionalId,
  priority: optionalEnum(TASK_PRIORITIES).transform((v) => v ?? "normal"),
  startDate: optionalDate,
  dueDate: optionalDate,
  estimateHours: optionalHours,
};

export const createTaskSchema = z
  .object({ projectId: id, parentTaskId: optionalId, ...taskFields })
  .refine((v) => !v.startDate || !v.dueDate || v.startDate <= v.dueDate, { path: ["dueDate"], message: "Due date can't be before the start." });

/** Sent only by forms that show it: absent leaves the link as it is, "" clears it. */
const deliverableLink = z
  .union([z.literal(""), z.uuid({ message: "Pick an option." })])
  .optional()
  .transform((v) => (v === undefined ? undefined : v || null));

export const updateTaskSchema = z
  .object({
    taskId: id,
    ...taskFields,
    deliverableId: deliverableLink,
    /** When the form's task was loaded (its updatedAt): a newer save in the meantime is refused, not overwritten. */
    loadedAt: z.string().datetime().optional().catch(undefined),
  })
  .refine((v) => !v.startDate || !v.dueDate || v.startDate <= v.dueDate, { path: ["dueDate"], message: "Due date can't be before the start." });

export const moveTaskSchema = z.object({
  taskId: id,
  status: z.enum(TASK_STATUSES),
  /** Neighbours in the target column after the move, if any. */
  afterId: optionalId,
  beforeId: optionalId,
  /** The person saw what is still open (unfinished blockers, checklist, subtasks) and marks it done anyway. */
  confirmed: z.boolean().optional(),
});

export const commentSchema = z.object({
  taskId: id,
  body: z.string().trim().min(1, { message: "Write something first." }).max(5000),
});

export const logTimeSchema = z.object({
  taskId: id,
  minutes: z.coerce.number().int().min(5, { message: "At least 5 minutes." }).max(720, { message: "At most 12 hours in one entry." }),
  workDate: optionalDate,
  note: optionalText(300),
});

/** Tags typed as "Shoot, Urgent client": trimmed, at most 10, each up to 30 characters (Stage 9b). */
export const taskTagsSchema = z.object({
  taskId: id,
  tags: z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : v.split(",")))
    .transform((xs) => xs.map((t) => t.trim().replace(/\s+/g, " ")).filter(Boolean))
    .refine((xs) => xs.every((t) => t.length <= 30), { message: "Keep each tag under 30 characters." })
    .refine((xs) => xs.length <= 10, { message: "At most 10 tags on a task." }),
});

export const TASK_BULK_ACTIONS = ["status", "owner", "priority", "due", "tag_add", "tag_remove"] as const;
export const bulkTaskSchema = z
  .object({
    ids: z.array(id).min(1, { message: "Pick at least one task." }).max(200, { message: "At most 200 tasks at a time." }),
    action: z.enum(TASK_BULK_ACTIONS),
    status: z.enum(TASK_STATUSES).optional(),
    ownerId: z.union([z.literal(""), id]).optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    /** Empty clears the due dates; leaving it out is a mistake, not a clear. */
    dueDate: z.union([z.literal(""), isoDate]).optional(),
    tag: z
      .string()
      .transform((t) => t.trim().replace(/\s+/g, " "))
      .refine((t) => t.length <= 30, { message: "Keep the tag under 30 characters." })
      .refine((t) => !t.includes(","), { message: "One tag at a time: no commas." })
      .optional(),
  })
  .refine((v) => v.action !== "status" || v.status, { path: ["status"], message: "Pick a status." })
  .refine((v) => v.action !== "owner" || v.ownerId !== undefined, { path: ["ownerId"], message: "Pick who to assign them to." })
  .refine((v) => v.action !== "due" || v.dueDate !== undefined, { path: ["dueDate"], message: "Pick a due date." })
  .refine((v) => v.action !== "priority" || v.priority, { path: ["priority"], message: "Pick a priority." })
  .refine((v) => !v.action.startsWith("tag") || v.tag, { path: ["tag"], message: "Type a tag." });

// ---------- Stage 9b.2: people on a task, its checklist, its files ----------

export const taskPersonSchema = z.object({ taskId: id, personId: id, role: z.enum(TASK_PERSON_ROLES) });

const checklistText = z
  .string()
  .transform((t) => t.trim().replace(/\s+/g, " "))
  .refine((t) => t.length > 0, { message: "Type the step." })
  .refine((t) => t.length <= 300, { message: "Keep a step under 300 characters." });

/** One step, or several pasted one per line. */
export const addChecklistSchema = z.object({
  taskId: id,
  text: z
    .string()
    .transform((t) => t.split(/\r?\n/).map((l) => l.trim().replace(/^[-*•]\s*|^\[\s?[xX ]?\]\s*/, "").replace(/\s+/g, " ")).filter(Boolean))
    .refine((xs) => xs.length > 0, { message: "Type the step." })
    .refine((xs) => xs.length <= 50, { message: "At most 50 steps at a time." })
    .refine((xs) => xs.every((x) => x.length <= 300), { message: "Keep a step under 300 characters." }),
});

export const CHECKLIST_ACTIONS = ["check", "uncheck", "rename", "remove", "up", "down"] as const;
export const checklistItemSchema = z
  .object({ itemId: id, action: z.enum(CHECKLIST_ACTIONS), text: checklistText.optional() })
  .refine((v) => v.action !== "rename" || v.text, { path: ["text"], message: "Type the step." });

/** A file (checked by the service) or a link to one kept elsewhere: https only. */
export const addTaskFileSchema = z.object({
  taskId: id,
  title: z.string().trim().max(120, { message: "Keep the name under 120 characters." }).optional().transform((v) => v || null),
  link: z
    .string()
    .trim()
    .max(1000, { message: "That link is too long." })
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || (URL.canParse(v) && new URL(v).protocol === "https:"), { message: "Paste a link starting with https://" }),
});

/** Stage 9b.3: the task waits on another one. */
export const dependencySchema = z.object({ taskId: id, dependsOnId: id });
