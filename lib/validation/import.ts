import { z } from "zod";
import { TASK_STATUSES } from "../types";
import { isoDate } from "./common";

/** One task read from a ClickUp CSV export, reduced to what Oppllo One keeps (D38). */
export const importedTaskSchema = z.object({
  ref: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(5000).nullable(),
  status: z.string().trim().max(60),
  dueDate: isoDate.nullable(),
  startDate: isoDate.nullable(),
  parentRef: z.string().trim().max(120).nullable(),
  assignees: z.array(z.string().trim().max(100)).max(20),
  priority: z.string().trim().max(20).nullable(),
  space: z.string().trim().max(200).nullable(),
  folder: z.string().trim().max(200).nullable(),
  list: z.string().trim().max(200).nullable(),
  estimateMinutes: z.number().int().min(0).max(100_000).nullable(),
});
export type ImportedTask = z.infer<typeof importedTaskSchema>;

export const importTasksSchema = z.array(importedTaskSchema).min(1, { message: "The file has no tasks." }).max(5000, { message: "At most 5,000 tasks at once." });

const level = z.enum(["space", "folder", "list"]);

/** How the export maps onto clients, projects, statuses and people. */
/** Statuses an imported task can take. Not done: closed work stays in the export (D38). */
const OPEN_STATUSES = TASK_STATUSES.filter((s) => s !== "done") as unknown as [Exclude<(typeof TASK_STATUSES)[number], "done">, ...Array<Exclude<(typeof TASK_STATUSES)[number], "done">>];

export const importMappingSchema = z
  .object({
    clientFrom: level,
    projectFrom: z.union([level, z.literal("none")]),
    /** Per source client name: create it, use an existing client, or leave its tasks out. */
    clients: z.record(z.string(), z.union([z.literal("new"), z.literal("skip"), z.uuid()])),
    /** Per ClickUp status: an open Oppllo status, or "skip" (closed work stays behind). */
    statuses: z.record(z.string(), z.union([z.enum(OPEN_STATUSES), z.literal("skip")])),
    /** Per ClickUp assignee name: a person, or "" for nobody. */
    people: z.record(z.string(), z.union([z.literal(""), z.uuid()])),
  })
  .refine((m) => m.clientFrom !== m.projectFrom, { path: ["projectFrom"], message: "Clients and projects need different ClickUp levels." });
export type ImportMapping = z.infer<typeof importMappingSchema>;
