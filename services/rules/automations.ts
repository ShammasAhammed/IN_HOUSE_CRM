// Automation rules (Stage 9b.5, ClickUp parity): "When <trigger> on a task [only if <conditions>], do <actions>".
// What a rule may say, and whether an event matches it. Pure, unit-tested. Running the actions: automation-runner.ts.
import { z } from "zod";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/types";

export const TRIGGERS = ["task_created", "status_changed", "assigned", "priority_changed", "commented", "tagged"] as const;
export type TriggerType = (typeof TRIGGERS)[number];
export const TRIGGER_LABELS: Record<TriggerType, string> = {
  task_created: "A task is created",
  status_changed: "A task's status changes",
  assigned: "A task is given to someone",
  priority_changed: "A task's priority changes",
  commented: "Someone comments on a task",
  tagged: "A task gets a tag",
};

export const ACTIONS = ["set_status", "set_priority", "assign", "add_tag", "add_watcher", "add_checklist", "notify", "set_due", "create_task"] as const;
export type ActionType = (typeof ACTIONS)[number];
export const ACTION_LABELS: Record<ActionType, string> = {
  set_status: "Set the status",
  set_priority: "Set the priority",
  assign: "Give it to",
  add_tag: "Add a tag",
  add_watcher: "Add a watcher",
  add_checklist: "Add checklist steps",
  notify: "Notify",
  set_due: "Set the due date",
  create_task: "Create a follow-up task",
};

const id = z.uuid();
const tag = z.string().trim().min(1).max(30).refine((t) => !t.includes(","), { message: "One tag, no commas." });

export const triggerSchema = z.object({
  type: z.enum(TRIGGERS),
  /** status_changed: only to this status. */
  status: z.enum(TASK_STATUSES).optional(),
  /** priority_changed: only to this priority. */
  priority: z.enum(TASK_PRIORITIES).optional(),
  /** tagged: only this tag. */
  tag: tag.optional(),
});
export const conditionsSchema = z.object({
  clientId: id.optional(),
  projectId: id.optional(),
  /** The task carries this tag. */
  hasTag: tag.optional(),
  /** Only tasks made through this request form (by name). */
  fromForm: z.string().trim().max(80).optional(),
});
export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("set_status"), status: z.enum(TASK_STATUSES) }),
  z.object({ type: z.literal("set_priority"), priority: z.enum(TASK_PRIORITIES) }),
  z.object({ type: z.literal("assign"), personId: id }),
  z.object({ type: z.literal("add_tag"), tag }),
  z.object({ type: z.literal("add_watcher"), personId: id }),
  z.object({ type: z.literal("add_checklist"), steps: z.array(z.string().trim().min(1).max(300)).min(1).max(30) }),
  z.object({ type: z.literal("notify"), personId: id, message: z.string().trim().min(1).max(200) }),
  z.object({ type: z.literal("set_due"), days: z.number().int().min(0).max(365) }),
  z.object({ type: z.literal("create_task"), title: z.string().trim().min(1).max(200), days: z.number().int().min(0).max(365).nullable(), ownerId: id.nullable() }),
]);
export type AutomationTrigger = z.infer<typeof triggerSchema>;
export type AutomationConditions = z.infer<typeof conditionsSchema>;
export type AutomationAction = z.infer<typeof actionSchema>;
export const actionsSchema = z.array(actionSchema).min(1, { message: "Add at least one action." }).max(10);

/** What happened, read from a committed event. Null for events rules don't listen to. */
export type TaskHappening = { taskId: string; trigger: TriggerType; status?: string; tags?: string[]; form?: string };

export function happeningOf(e: { action: string; entityType: string; entityId: string; data?: Record<string, unknown> }): TaskHappening | null {
  if (e.entityType !== "task") return null;
  const d = e.data ?? {};
  switch (e.action) {
    case "task.created":
      return { taskId: e.entityId, trigger: "task_created", ...(typeof d.form === "string" ? { form: d.form } : {}) };
    case "task.completed":
    case "task.reopened":
    case "task.status_changed":
      return { taskId: e.entityId, trigger: "status_changed", status: typeof d.to === "string" ? d.to : e.action === "task.completed" ? "done" : undefined };
    case "task.reassigned":
      return typeof d.to === "string" ? { taskId: e.entityId, trigger: "assigned" } : null;
    case "task.updated":
      return Array.isArray(d.fields) && d.fields.includes("priority") ? { taskId: e.entityId, trigger: "priority_changed" } : null;
    case "task.commented":
      return { taskId: e.entityId, trigger: "commented" };
    case "task.tagged":
      return { taskId: e.entityId, trigger: "tagged", tags: Array.isArray(d.tags) ? d.tags.filter((t): t is string => typeof t === "string") : [] };
    default:
      return null;
  }
}

/** Whether a rule fires for this happening on this task (as it is now). */
export function ruleMatches(
  rule: { trigger: AutomationTrigger; conditions: AutomationConditions },
  h: TaskHappening,
  task: { clientId: string; projectId: string; tags: string[]; priority: string; status: string },
): boolean {
  const t = rule.trigger;
  if (t.type !== h.trigger) return false;
  if (t.type === "status_changed" && t.status && (h.status ?? task.status) !== t.status) return false;
  if (t.type === "priority_changed" && t.priority && task.priority !== t.priority) return false;
  if (t.type === "tagged" && t.tag && !(h.tags ?? task.tags).some((x) => x.toLowerCase() === t.tag!.toLowerCase())) return false;
  const c = rule.conditions;
  if (c.clientId && task.clientId !== c.clientId) return false;
  if (c.projectId && task.projectId !== c.projectId) return false;
  if (c.hasTag && !task.tags.some((x) => x.toLowerCase() === c.hasTag!.toLowerCase())) return false;
  if (c.fromForm && h.form !== c.fromForm) return false;
  return true;
}
