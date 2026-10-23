// A task's history in words (test report M4): who changed what, from the events every change already writes.
import { formatMinutes } from "@/lib/format";
import { CONTENT_STATUS_LABELS, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS, type ContentStatus, type TaskPriority, type TaskStatus } from "@/lib/types";

export type ActivityEvent = { action: string; data: Record<string, unknown>; actorId?: string | null; entityId?: string };

/** How ids and dates become words: people, the project's stages, dates. */
export type ActivityNames = { name: (personId: string) => string; stage: (stageId: string) => string; day: (iso: string) => string; creative?: (assetId: string) => string };

const FIELD_NAMES: Record<string, string> = {
  title: "the title",
  description: "the notes",
  ownerId: "the owner",
  reviewerId: "the reviewer",
  priority: "the priority",
  dueDate: "the due date",
  startDate: "the start date",
  stageId: "the stage",
  estimateMinutes: "the estimate",
  deliverableId: "the deliverable",
  status: "the status",
  tags: "the tags",
};

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const status = (v: unknown) => TASK_STATUS_LABELS[v as TaskStatus] ?? str(v) ?? "—";
const list = (names: string[]) => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);

/**
 * One line for an event, without the person ("changed the due date from 20 Oct to 24 Oct").
 * `name` turns a person id into a name, `day` formats a date. Returns null for events not worth showing.
 */
export function describeTaskEvent(e: ActivityEvent, names: ActivityNames): string | null {
  const { name, day } = names;
  const d = e.data ?? {};
  const creativeOf = (ev: ActivityEvent) => (ev.entityId && names.creative ? `“${names.creative(ev.entityId)}”` : "the creative");
  const note = () => (str(d.note) ? `: “${d.note as string}”` : "");
  const value = (field: string, v: unknown): string => {
    if (v === null || v === undefined || v === "") return field === "ownerId" || field === "reviewerId" ? "nobody" : "none";
    if (field === "ownerId" || field === "reviewerId") return name(String(v));
    if (field === "stageId") return names.stage(String(v));
    if (field === "priority") return TASK_PRIORITY_LABELS[v as TaskPriority] ?? String(v);
    if (field === "status") return status(v);
    if (field === "estimateMinutes") return formatMinutes(Number(v));
    if (field.endsWith("Date") && typeof v === "string") return day(v);
    if (field === "deliverableId") return "a deliverable";
    return `“${String(v)}”`;
  };
  // Every field changed in one save, each with before → after where known (QA S2-B1).
  const changes = (): string | null => {
    const fields = Array.isArray(d.fields) ? (d.fields as string[]) : [];
    const values = (d.values ?? {}) as Record<string, [unknown, unknown]>;
    if (d.from !== undefined && !("ownerId" in values) && (fields.includes("ownerId") || e.action === "task.reassigned")) values.ownerId = [d.from, d.to];
    const spelled = Object.entries(values).map(([f, [from, to]]) => (f === "description" ? FIELD_NAMES[f]! : `${FIELD_NAMES[f] ?? f} from ${value(f, from)} to ${value(f, to)}`));
    const rest = fields.filter((f) => !(f in values)).map((f) => FIELD_NAMES[f] ?? f);
    const parts = [...spelled, ...rest];
    return parts.length ? `changed ${list(parts)}` : null;
  };
  switch (e.action) {
    case "task.created":
      return "created the task";
    // Time, creatives and calendar posts on this task (QA S8-B2).
    case "time.logged":
      return `logged ${formatMinutes(Number(d.minutes ?? 0))}${typeof d.workDate === "string" ? ` for ${day(d.workDate)}` : ""}`;
    case "time.changed":
      return `changed logged time from ${formatMinutes(Number(d.from ?? 0))} to ${formatMinutes(Number(d.to ?? 0))}${typeof d.workDate === "string" ? ` for ${day(d.workDate)}` : ""}`;
    case "time.removed":
      return `removed ${formatMinutes(Number(d.minutes ?? 0))} of logged time${typeof d.workDate === "string" ? ` for ${day(d.workDate)}` : ""}`;
    case "asset.created":
      return `added the creative ${str(d.title) ? `“${d.title as string}”` : creativeOf(e)}`;
    case "asset.version_added":
      return `uploaded a new version of ${creativeOf(e)}`;
    case "asset.submit":
      return `sent ${creativeOf(e)} for review`;
    case "asset.request_changes":
      return `asked for changes to ${creativeOf(e)}${note()}`;
    case "asset.approve":
    case "asset.approved":
      return `approved ${creativeOf(e)} inside the team`;
    case "asset.send_to_client":
      return `sent ${creativeOf(e)} to the client`;
    case "asset.client_approved":
      return `recorded the client's approval of ${creativeOf(e)}${note()}`;
    case "asset.client_changes":
      return `recorded the client's changes to ${creativeOf(e)}${note()}`;
    case "asset.commented":
      return `commented on ${creativeOf(e)}`;
    case "content.created":
      return `put ${str(d.title) ? `“${d.title as string}”` : "a post"} on the content calendar`;
    case "content.updated":
    case "content.status_changed": {
      const changes = (d.changes ?? {}) as Record<string, [unknown, unknown]>;
      const to = changes.status?.[1];
      return to ? `marked the calendar post ${String(CONTENT_STATUS_LABELS[to as ContentStatus] ?? to)}` : "changed the calendar post";
    }
    case "content.ready":
      return "the calendar post is ready: its creative was approved";
    case "content.removed":
      return "took the post off the content calendar";
    case "task.status_changed":
    case "task.completed":
    case "task.reopened":
      return d.from !== undefined || d.to !== undefined ? `moved it from ${status(d.from)} to ${status(d.to)}` : e.action === "task.completed" ? "marked it done" : "reopened it";
    case "task.reassigned":
    case "task.updated":
      return changes() ?? "edited the task";
    case "task.commented":
      return "commented";
    case "task.tagged":
      return Array.isArray(d.tags) && d.tags.length ? `set the tags to ${(d.tags as string[]).join(", ")}` : "removed the tags";
    case "task.checklist_added":
      return Array.isArray(d.steps) && d.steps.length === 1 ? `added the step “${String(d.steps[0])}”` : Array.isArray(d.steps) ? `added ${d.steps.length} checklist steps` : "added checklist steps";
    case "task.checklist_checked":
      return `ticked “${str(d.step) ?? "a step"}”`;
    case "task.checklist_unchecked":
      return `unticked “${str(d.step) ?? "a step"}”`;
    case "task.checklist_removed":
      return `removed the step “${str(d.step) ?? "a step"}”`;
    case "task.checklist_renamed":
      return "renamed a checklist step";
    case "task.file_added":
      return `attached ${str(d.name) ?? "a file"}`;
    case "task.file_removed":
      return `removed ${str(d.name) ?? "a file"}`;
    case "task.ai_draft_created":
      return `asked the AI teammate for a ${(str(d.kindLabel) ?? "draft").toLowerCase()}`;
    case "task.ai_draft_approved":
      return `approved the AI's ${(str(d.kindLabel) ?? "draft").toLowerCase()}${d.edited ? " (edited)" : ""}`;
    case "task.ai_draft_rejected":
      return `rejected the AI's ${(str(d.kindLabel) ?? "draft").toLowerCase()}`;
    case "task.person_added": {
      const who = str(d.personId);
      if (d.role === "watcher" && who && who === e.actorId) return "started watching";
      return who ? `added ${name(who)} as ${d.role === "watcher" ? "a watcher" : "an assignee"}` : "added someone";
    }
    case "task.person_removed": {
      const who = str(d.personId);
      if (d.role === "watcher") return !who || who === e.actorId ? "stopped watching" : `stopped ${name(who)} watching`;
      return who ? `took ${name(who)} off the task` : "took someone off the task";
    }
    case "task.dependency_added":
      return "made it wait on another task";
    case "task.dependency_removed":
      return "removed a task it waited on";
    case "task.fields_changed":
      return Array.isArray(d.fields) && d.fields.length ? `changed ${list(d.fields as string[])}` : "changed the fields";
    default:
      return null;
  }
}
