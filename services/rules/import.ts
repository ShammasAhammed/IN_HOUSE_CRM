// Moving off ClickUp (plan/3-projects-module.md, D38): clients and open tasks only; completed history stays behind.
// Pure planning, unit-tested: what the import will create from a mapped export.

import type { IsoDate } from "@/lib/dates";
import type { TaskPriority, TaskStatus } from "@/lib/types";
import type { ImportMapping, ImportedTask } from "@/lib/validation/import";

/** The project tasks land in when the export has no folder or list to name one. */
export const FALLBACK_PROJECT = "Imported from ClickUp";

/** A sensible Oppllo status for a ClickUp status; closed work is left behind. */
export function suggestStatus(raw: string): TaskStatus | "skip" {
  const s = raw.toLowerCase();
  if (/complete|closed|done|cancel|archiv/.test(s)) return "skip";
  if (/block|hold|wait|stuck|pending/.test(s)) return "blocked";
  if (/review|approv|feedback|qa|check|client/.test(s)) return "in_review";
  if (/progress|doing|working|started|active/.test(s)) return "in_progress";
  return "todo";
}

/** A person for a ClickUp assignee name: same full name, or a first name only one person has. */
export function suggestPerson(name: string, people: ReadonlyArray<{ id: string; fullName: string; email?: string | null }>): string {
  const n = name.trim().toLowerCase();
  // ClickUp often names people by their email: match that exactly first (test report M10).
  const byEmail = people.find((p) => p.email && p.email.trim().toLowerCase() === n);
  if (byEmail) return byEmail.id;
  const exact = people.find((p) => p.fullName.toLowerCase() === n);
  if (exact) return exact.id;
  const first = people.filter((p) => p.fullName.toLowerCase().split(/\s+/)[0] === n.split(/\s+/)[0]);
  return first.length === 1 ? first[0]!.id : "";
}

const PRIORITIES: Record<string, TaskPriority> = { urgent: "urgent", high: "high", normal: "normal", low: "low" };

export type PlannedTask = {
  ref: string;
  /** Set for a subtask whose parent is in the import or already imported. */
  parentRef: string | null;
  clientKey: string;
  projectName: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  ownerId: string | null;
  startDate: IsoDate | null;
  dueDate: IsoDate | null;
  estimateMinutes: number | null;
};

export type ImportPlan = {
  /** Source client names to use, with the existing client chosen for each (null = create). */
  clients: Array<{ key: string; existingId: string | null }>;
  projects: Array<{ clientKey: string; name: string }>;
  tasks: PlannedTask[];
  skipped: { closed: number; clientLeftOut: number; noClient: number };
};

export function planImport(input: ImportedTask[], mapping: ImportMapping): ImportPlan {
  const byRef = new Map(input.map((t) => [t.ref, t]));
  const statusOf = (t: ImportedTask) => mapping.statuses[t.status] ?? suggestStatus(t.status);
  /** A subtask's top-level ancestor in the file (Oppllo One has one level of subtasks). */
  const topOf = (t: ImportedTask): ImportedTask => {
    let cur = t;
    for (let i = 0; i < 10 && cur.parentRef && byRef.has(cur.parentRef); i++) cur = byRef.get(cur.parentRef)!;
    return cur;
  };

  const skipped = { closed: 0, clientLeftOut: 0, noClient: 0 };
  const tasks: PlannedTask[] = [];
  const clientKeys = new Set<string>();
  const projects = new Map<string, { clientKey: string; name: string }>();

  for (const t of input) {
    const status = statusOf(t);
    if (status === "skip") {
      skipped.closed++;
      continue;
    }
    // A subtask belongs where its top-level task does; if that one is closed, it stands on its own.
    const top = topOf(t);
    const parentOpen = top !== t && statusOf(top) !== "skip";
    const home = parentOpen ? top : t;
    const clientKey = home[mapping.clientFrom];
    if (!clientKey) {
      skipped.noClient++;
      continue;
    }
    const choice = mapping.clients[clientKey] ?? "new";
    if (choice === "skip") {
      skipped.clientLeftOut++;
      continue;
    }
    const projectName = (mapping.projectFrom === "none" ? null : home[mapping.projectFrom]) ?? FALLBACK_PROJECT;
    clientKeys.add(clientKey);
    projects.set(`${clientKey}\u0000${projectName}`, { clientKey, name: projectName });

    const owner = t.assignees.map((a) => mapping.people[a]).find((id) => id);
    tasks.push({
      ref: t.ref,
      // A parent outside the file may already have been imported; the service checks.
      parentRef: parentOpen ? top.ref : t.parentRef && !byRef.has(t.parentRef) ? t.parentRef : null,
      clientKey,
      projectName,
      title: t.name,
      description: t.description,
      status,
      priority: PRIORITIES[t.priority ?? ""] ?? "normal",
      ownerId: owner || null,
      startDate: t.startDate && t.dueDate && t.startDate > t.dueDate ? null : t.startDate,
      dueDate: t.dueDate,
      estimateMinutes: t.estimateMinutes,
    });
  }

  return {
    clients: [...clientKeys].map((key) => {
      const choice = mapping.clients[key];
      return { key, existingId: choice && choice !== "new" && choice !== "skip" ? choice : null };
    }),
    projects: [...projects.values()],
    tasks,
    skipped,
  };
}
