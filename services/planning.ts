// Planning views (Stage 9b.3, ClickUp parity): a month calendar of due dates, a timeline (Gantt) of start-to-due bars
// grouped by project, and "waits on" links between tasks. Same rights as the list: you see what your scope allows.
import { addDays, addMonths, isIsoDate, startOfMonth, startOfWeek, type IsoDate } from "@/lib/dates";
import { isId, newId } from "@/lib/id";
import { conflict, forbidden, invalid, notFound, ok, type Result } from "@/lib/result";
import { parse } from "@/lib/validation/common";
import { dependencySchema } from "@/lib/validation/tasks";
import type { DataStore, TaskFilter } from "@/repositories";
import { change, commit, noChange } from "./change";
import type { Clock } from "./clock";
import type { Actor } from "./permissions";
import { levelBlocks } from "./spaces";
import { barFor, monthGrid, wouldLoop, type Bar } from "./rules/planning";
import { canEdit, taskScope, taskView, type TaskView } from "./tasks";

export type PlanFilter = { owner?: string; clientId?: string; projectId?: string; status?: string };

export type CalendarMonth = { truncated: boolean; month: IsoDate; prev: IsoDate; next: IsoDate; days: IsoDate[]; today: IsoDate; byDay: Record<IsoDate, TaskView[]> };

export type TimelineRow = { projectId: string; projectName: string; clientName: string; tasks: Array<TaskView & { bar: Bar }> };
export type Timeline = { truncated: boolean; from: IsoDate; days: IsoDate[]; today: IsoDate; prev: IsoDate; next: IsoDate; rows: TimelineRow[]; links: Array<{ taskId: string; dependsOnId: string }> };

export type TaskDependencies = { waitingOn: TaskView[]; blocking: TaskView[]; hidden: number; canEdit: boolean };

const OPEN = ["todo", "in_progress", "in_review", "blocked"] as const;
const MAX_DEPENDENCIES = 20;
/** Most tasks a calendar month or timeline shows; past this the page says so. */
const LIMIT = 3000;

export function createPlanningService(deps: { store: DataStore; clock: Clock }) {
  const { store, clock } = deps;

  function scoped(actor: Actor, f: PlanFilter): TaskFilter {
    return {
      scope: taskScope(actor),
      anyLevel: true,
      ...(f.clientId && isId(f.clientId) ? { clientId: f.clientId } : {}),
      ...(f.projectId && isId(f.projectId) ? { projectId: f.projectId } : {}),
      ...(f.owner === "me" ? { assignedTo: actor.personId } : f.owner && isId(f.owner) ? { assignedTo: f.owner } : {}),
      ...(f.status === "all" ? {} : { statuses: OPEN }),
      limit: LIMIT,
    };
  }

  return {
    /** A month of tasks by due date (Monday-first weeks), open tasks unless asked for all. */
    async calendar(actor: Actor, monthRaw: string | undefined, f: PlanFilter = {}): Promise<Result<CalendarMonth>> {
      const today = clock.today();
      const month = startOfMonth(monthRaw && isIsoDate(`${monthRaw}-01`) ? `${monthRaw}-01` : today);
      const days = monthGrid(month);
      const rows = await store.tasks.list({ ...scoped(actor, f), dueFrom: days[0]!, dueTo: days.at(-1)!, sort: { by: "priority", dir: "asc" } });
      const view = taskView(actor, today);
      const byDay: Record<IsoDate, TaskView[]> = {};
      for (const t of rows) (byDay[t.dueDate!] ??= []).push(view(t));
      return ok({ truncated: rows.length >= LIMIT, month, prev: addMonths(month, -1), next: addMonths(month, 1), days, today, byDay });
    },

    /** A timeline of `weeks` weeks from a Monday: bars from start (or due) to due, one row per task, grouped by project. */
    async timeline(actor: Actor, fromRaw: string | undefined, weeksRaw: number, f: PlanFilter = {}): Promise<Result<Timeline>> {
      const today = clock.today();
      const weeks = [2, 4, 8, 12].includes(weeksRaw) ? weeksRaw : 4;
      const from = startOfWeek(fromRaw && isIsoDate(fromRaw) ? fromRaw : addDays(today, -7));
      const count = weeks * 7;
      const to = addDays(from, count - 1);
      const rows = await store.tasks.list({ ...scoped(actor, f), overlaps: { from, to }, sort: { by: "due", dir: "asc" } });
      const view = taskView(actor, today);
      const groups = new Map<string, TimelineRow>();
      for (const t of rows) {
        const bar = barFor(t.startDate, t.dueDate, from, count);
        if (!bar) continue;
        const g = groups.get(t.projectId) ?? { projectId: t.projectId, projectName: t.projectName, clientName: t.clientName, tasks: [] };
        g.tasks.push({ ...view(t), bar });
        groups.set(t.projectId, g);
      }
      for (const g of groups.values()) g.tasks.sort((a, b) => a.bar.offset - b.bar.offset || b.bar.length - a.bar.length);
      const shown = new Set(rows.map((t) => t.id));
      const links = (await store.tasks.dependencyLinks([...shown])).filter((l) => shown.has(l.taskId) && shown.has(l.dependsOnId));
      return ok({
        truncated: rows.length >= LIMIT,
        from,
        days: Array.from({ length: count }, (_, i) => addDays(from, i)),
        today,
        prev: addDays(from, -7 * Math.max(1, weeks / 2)),
        next: addDays(from, 7 * Math.max(1, weeks / 2)),
        rows: [...groups.values()].sort((a, b) => a.clientName.localeCompare(b.clientName) || a.projectName.localeCompare(b.projectName)),
        links,
      });
    },

    /** What a task waits on and what waits on it; tasks outside your view are only counted. */
    async dependencies(actor: Actor, taskId: string): Promise<Result<TaskDependencies>> {
      const t = isId(taskId) ? await store.tasks.findById(taskId, taskScope(actor)) : null;
      if (!t) return notFound("That task");
      const links = await store.tasks.dependencyLinks([t.id]);
      const ids = [...new Set(links.map((l) => (l.taskId === t.id ? l.dependsOnId : l.taskId)))];
      const visible = ids.length ? await store.tasks.list({ scope: taskScope(actor), ids }) : [];
      const view = taskView(actor, clock.today());
      const byId = new Map(visible.map((v) => [v.id, view(v)]));
      return ok({
        waitingOn: links.filter((l) => l.taskId === t.id && byId.has(l.dependsOnId)).map((l) => byId.get(l.dependsOnId)!),
        blocking: links.filter((l) => l.dependsOnId === t.id && byId.has(l.taskId)).map((l) => byId.get(l.taskId)!),
        hidden: ids.filter((i) => !byId.has(i)).length,
        canEdit: canEdit(actor, t),
      });
    },

    /** Make a task wait on another one you can see. Loops are refused. */
    async addDependency(actor: Actor, raw: unknown): Promise<Result<null>> {
      const parsed = parse(dependencySchema, raw);
      if (!parsed.ok) return parsed;
      const { taskId, dependsOnId } = parsed.value;
      if (taskId === dependsOnId) return invalid("A task can't wait on itself.");
      return commit(store, async (repos) => {
        const [t, blocker] = await Promise.all([repos.tasks.findById(taskId, taskScope(actor)), repos.tasks.findById(dependsOnId, taskScope(actor))]);
        if (!t || !blocker) return notFound("That task");
        if (blocker.clientId !== t.clientId) return invalid("Pick a task for the same client.");
        if (!canEdit(actor, t)) return forbidden("Only the task's owner, assignees, reviewer, creator or a lead can change it.");
        { const blocked = await levelBlocks(repos, actor, t.clientId, "edit"); if (blocked) return blocked; }
        // Walk what the blocker waits on, outward, to refuse a loop.
        const waitsOn = new Map<string, string[]>();
        let frontier = [dependsOnId];
        for (let depth = 0; frontier.length && depth < 50; depth++) {
          const links = (await repos.tasks.dependencyLinks(frontier)).filter((l) => frontier.includes(l.taskId));
          const next: string[] = [];
          for (const l of links) {
            if (!waitsOn.has(l.taskId)) waitsOn.set(l.taskId, []);
            waitsOn.get(l.taskId)!.push(l.dependsOnId);
            if (!waitsOn.has(l.dependsOnId)) next.push(l.dependsOnId);
          }
          frontier = [...new Set(next)];
        }
        if (wouldLoop(taskId, dependsOnId, waitsOn)) return conflict(`"${blocker.title}" already waits on this task, so this would make a loop.`);
        const existing = (await repos.tasks.dependencyLinks([taskId])).filter((l) => l.taskId === taskId);
        if (existing.some((l) => l.dependsOnId === dependsOnId)) return noChange(null);
        if (existing.length >= MAX_DEPENDENCIES) return invalid(`A task can wait on up to ${MAX_DEPENDENCIES} others.`);
        await repos.tasks.addDependency({ id: newId(), taskId, dependsOnId, createdById: actor.personId });
        return change(null, {
          actorId: actor.personId,
          action: "task.dependency_added",
          entityType: "task",
          entityId: taskId,
          clientId: t.clientId,
          data: { dependsOnId, title: t.title, blocker: blocker.title, blockerDone: blocker.status === "done" },
        });
      });
    },

    async removeDependency(actor: Actor, raw: unknown): Promise<Result<null>> {
      const parsed = parse(dependencySchema, raw);
      if (!parsed.ok) return parsed;
      const { taskId, dependsOnId } = parsed.value;
      return commit(store, async (repos) => {
        const t = await repos.tasks.findById(taskId, taskScope(actor));
        if (!t) return notFound("That task");
        if (!canEdit(actor, t)) return forbidden("Only the task's owner, assignees, reviewer, creator or a lead can change it.");
        { const blocked = await levelBlocks(repos, actor, t.clientId, "edit"); if (blocked) return blocked; }
        if (!(await repos.tasks.removeDependency(taskId, dependsOnId, clock.now()))) return noChange(null);
        return change(null, { actorId: actor.personId, action: "task.dependency_removed", entityType: "task", entityId: taskId, clientId: t.clientId, data: { dependsOnId, title: t.title } });
      });
    },

    /** Tasks to pick as a blocker: open tasks you can see in the same client, by title. */
    async blockerOptions(actor: Actor, taskId: string): Promise<Array<{ id: string; title: string; projectName: string }>> {
      const t = isId(taskId) ? await store.tasks.findById(taskId, taskScope(actor)) : null;
      if (!t) return [];
      const rows = await store.tasks.list({ scope: taskScope(actor), clientId: t.clientId, statuses: OPEN, anyLevel: true, sort: { by: "title", dir: "asc" }, limit: 300 });
      // Never the task itself, its own subtasks, or its parent (QA S9-03): a task can't wait on its own parts.
      return rows.filter((r) => r.id !== t.id && r.parentTaskId !== t.id && r.id !== t.parentTaskId).map((r) => ({ id: r.id, title: r.title, projectName: r.projectName }));
    },
  };
}

export type PlanningService = ReturnType<typeof createPlanningService>;
