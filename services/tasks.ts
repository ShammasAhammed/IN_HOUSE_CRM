// Tasks: My Day, the Board, task detail, comments and time (Projects slice 1 and 2).
// Speed matters more than features here (plan/3-projects-module.md): few, parallel queries per screen.

import { generateKeyBetween } from "fractional-indexing";
import { addDays, type IsoDate } from "@/lib/dates";
import { isId, newId } from "@/lib/id";
import { conflict, fail, forbidden, invalid, notFound, ok, type Result } from "@/lib/result";
import { TASK_PRIORITIES, TASK_STATUSES, type TaskPriority, type TaskStatus } from "@/lib/types";
import { parse } from "@/lib/validation/common";
import { bulkTaskSchema, commentSchema, createTaskSchema, logTimeSchema, moveTaskSchema, taskTagsSchema, updateTaskSchema } from "@/lib/validation/tasks";
import { z } from "zod";
import { TASK_SORTS, type CommentRow, type DataStore, type NewEvent, type Repositories, type TaskDetailRow, type TaskFilter, type TaskRow, type TaskScope, type TaskSort, type SavedTaskView, type TimeEntryRow } from "@/repositories";
import { change, commit, noChange } from "./change";
import type { Clock } from "./clock";
import { can, everything, type Actor } from "./permissions";
import { OUTSIDE_SPACE, spaceGuard, levelBlocks } from "./spaces";
import { findMentions } from "./rules/mentions";
import { describeTaskEvent } from "./rules/task-activity";
import { isTimeLocked } from "./rules/time";

export function taskScope(actor: Actor): TaskScope {
  if (can(actor, "tasks.read.all")) return everything(actor);
  if (can(actor, "tasks.read.assigned")) return { kind: "assigned", personId: actor.personId };
  return { kind: "own", personId: actor.personId };
}

/** A task row as one person sees it: their rights, overdue, and hours only when theirs to see. */
export const taskView = (actor: Actor, today: IsoDate) => (t: TaskRow): TaskView => ({
  ...t,
  loggedMinutes: seesAllHours(actor, t) ? t.loggedMinutes : null,
  overdue: t.status !== "done" && t.dueDate !== null && t.dueDate < today,
  canEdit: canEdit(actor, t),
});

/** Change a task's fields or status: anyone with tasks.write.all, or its owner, another assignee, reviewer or creator. */
export function canEdit(actor: Actor, t: Pick<TaskRow, "ownerId" | "reviewerId" | "createdById"> & { assignees?: TaskRow["assignees"] }): boolean {
  return can(actor, "tasks.write.all") || [t.ownerId, t.reviewerId, t.createdById].includes(actor.personId) || Boolean(t.assignees?.some((a) => a.id === actor.personId));
}

/** Create tasks: people who plan work, and creative roles inside their clients' projects. Interns get tasks assigned. */
/** Add tasks: leads, and creatives in their clients' projects. Interns, the BDO and accounts ask a lead. */
export function canCreateTasks(actor: Actor): boolean {
  return can(actor, "tasks.write.all") || can(actor, "tasks.read.assigned");
}
const canCreate = canCreateTasks;

/** Hours logged on a task: everyone's on your own tasks or with time.read.all; otherwise not shown (D15). */
const seesAllHours = (actor: Actor, t: Pick<TaskRow, "ownerId">) => can(actor, "time.read.all") || t.ownerId === actor.personId;

export type TaskView = Omit<TaskRow, "loggedMinutes"> & {
  overdue: boolean;
  canEdit: boolean;
  /** Null when the hours on someone else's task aren't this person's to see (D15). */
  loggedMinutes: number | null;
};

/** One line of a task's history. `who` is the person, or Oppllo One for automations and the daily job. */
export type TaskActivity = { id: string; at: Date; who: string; text: string };

export type TaskDetail = TaskView & {
  description: string | null;
  /** The engagement promise this task counts towards (deliverable counting). */
  deliverableId: string | null;
  /** What the task's engagement promises, to pick from. */
  deliverables: Array<{ id: string; name: string }>;
  reviewerName: string | null;
  createdAt: Date;
  updatedAt: Date;
  subtasks: TaskView[];
  comments: CommentRow[];
  time: Array<TimeEntryRow & { canEdit: boolean }>;
  stages: Array<{ id: string; name: string }>;
  /** May mark time non-billable or change anyone's entries (time.manage). */
  canManageTime: boolean;
  /** Interns, the BDO and accounts can't add tasks (they ask a lead). */
  canAddSubtask: boolean;
};

export type MyDay = {
  today: IsoDate;
  overdue: TaskView[];
  dueToday: TaskView[];
  comingUp: TaskView[];
  doneToday: TaskView[];
  loggedTodayMinutes: number;
};

export type BoardColumn = { status: TaskStatus; tasks: TaskView[] };

/** "Today" in India as an instant: midnight IST. */
const startOfIstDay = (date: IsoDate) => new Date(`${date}T00:00:00+05:30`);

export function createTaskService(deps: { store: DataStore; clock: Clock }) {
  const { store, clock } = deps;

  const toView = taskView;

  /** Tags in the casing the team already uses ("shoot" becomes "Shoot" if that exists), no repeats. */
  async function normaliseTags(tags: readonly string[]): Promise<string[]> {
    const known = new Map((await store.tasks.allTags()).map((t) => [t.tag.toLowerCase(), t.tag]));
    const out = new Map<string, string>();
    for (const t of tags) if (!out.has(t.toLowerCase())) out.set(t.toLowerCase(), known.get(t.toLowerCase()) ?? t);
    return [...out.values()];
  }

  const DUPLICATE_WINDOW_SECONDS = 10;

  const event = (actor: Actor, t: Pick<TaskRow, "id" | "clientId">, action: string, data?: Record<string, unknown>): NewEvent => ({
    actorId: actor.personId,
    action,
    entityType: "task",
    entityId: t.id,
    clientId: t.clientId,
    ...(data ? { data } : {}),
  });

  const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

  /** What is still unfinished on a task: the tasks it waits on, checklist steps, subtasks. */
  async function stillOpen(repos: Repositories, t: TaskRow): Promise<string[]> {
    const links = (await repos.tasks.dependencyLinks([t.id])).filter((l) => l.taskId === t.id);
    const blockers = links.length ? await repos.tasks.list({ scope: { kind: "all" }, ids: links.map((l) => l.dependsOnId) }) : [];
    const waiting = blockers.filter((b) => b.status !== "done").length;
    const steps = (await repos.tasks.checklist(t.id)).filter((c) => !c.done).length;
    const subtasks = t.subtasksTotal - t.subtasksDone;
    const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
    return [
      ...(waiting ? [plural(waiting, "unfinished task it waits on", "unfinished tasks it waits on")] : []),
      ...(steps ? [plural(steps, "open checklist step", "open checklist steps")] : []),
      ...(subtasks > 0 ? [plural(subtasks, "open subtask", "open subtasks")] : []),
    ];
  }

  async function visibleTask(actor: Actor, id: string): Promise<TaskDetailRow | null> {
    if (!isId(id)) return null;
    return store.tasks.findById(id, taskScope(actor));
  }

  return {
    /** The default screen: overdue, due today, the next few days, and what was finished today. */
    async myDay(actor: Actor): Promise<Result<MyDay>> {
      const today = clock.today();
      const scope: TaskScope = { kind: "own", personId: actor.personId };
      const [open, done, time] = await Promise.all([
        store.tasks.list({ scope, assignedTo: actor.personId, openDueOnOrBefore: addDays(today, 6) }),
        store.tasks.list({ scope, assignedTo: actor.personId, statuses: ["done"], completedSince: startOfIstDay(today) }),
        store.time.list({ personId: actor.personId, from: today, to: today }),
      ]);
      const view = toView(actor, today);
      const byPriority = (a: TaskRow, b: TaskRow) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      return ok({
        today,
        overdue: open.filter((t) => t.dueDate! < today).map(view),
        dueToday: open.filter((t) => t.dueDate === today).sort(byPriority).map(view),
        comingUp: open.filter((t) => t.dueDate! > today).map(view),
        doneToday: done.map(view),
        loggedTodayMinutes: time.reduce((s, e) => s + e.minutes, 0),
      });
    },

    /** The Board: top-level tasks by status. Done shows only the last 14 days, so the board stays fast. */
    async board(actor: Actor, filter: { projectId?: string; clientId?: string; ownerId?: string }): Promise<Result<{ columns: BoardColumn[]; total: number; canCreate: boolean }>> {
      const today = clock.today();
      const scope = taskScope(actor);
      const [open, done] = await Promise.all([
        store.tasks.list({ scope, projectId: filter.projectId, clientId: filter.clientId, assignedTo: filter.ownerId, statuses: ["todo", "in_progress", "in_review", "blocked"] }),
        store.tasks.list({ scope, ...filter, statuses: ["done"], completedSince: startOfIstDay(addDays(today, -14)) }),
      ]);
      const view = toView(actor, today);
      const byRank = (a: TaskRow, b: TaskRow) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0);
      const columns = BOARD_ORDER.map((status) => ({
        status,
        tasks: (status === "done" ? done.sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0)) : open.filter((t) => t.status === status).sort(byRank)).map(view),
      }));
      return ok({ columns, total: open.length + done.length, canCreate: canCreate(actor) });
    },

    /** The task's history (test report M4): who changed what and when, newest first. */
    async activity(actor: Actor, taskId: string, opts: { day: (iso: string) => string }): Promise<Result<TaskActivity[]>> {
      const t = await visibleTask(actor, taskId);
      if (!t) return notFound("That task");
      // The creatives made on this task and the calendar posts that use them belong to its story too (QA S8-B2).
      const assets = await store.assets.list({ scope: { kind: "all" }, taskId: t.id, limit: 50 });
      const posts = (await Promise.all(assets.map((a) => store.content.listByAsset(a.id)))).flat();
      const [rows, people, stages] = await Promise.all([
        store.events.listForTask({ taskId: t.id, assetIds: assets.map((a) => a.id), contentIds: posts.map((p) => p.id), limit: 80 }),
        store.people.listAll(),
        store.projects.listStages([t.projectId]),
      ]);
      const names = new Map(people.map((p) => [p.id, p.fullName]));
      const stageNames = new Map(stages.map((s) => [s.id, s.name]));
      const titles = new Map(assets.map((a) => [a.id, a.title]));
      const words = { name: (id: string) => names.get(id) ?? "someone", stage: (id: string) => stageNames.get(id) ?? "a removed stage", day: opts.day, creative: (id: string) => titles.get(id) ?? "a creative" };
      return ok(rows.flatMap((e) => {
        const text = describeTaskEvent(e, words);
        return text ? [{ id: e.id, at: e.occurredAt, who: e.actorName ?? "Oppllo One", text }] : [];
      }));
    },

    async get(actor: Actor, taskId: string): Promise<Result<TaskDetail>> {
      const t = await visibleTask(actor, taskId);
      if (!t) return notFound("That task");
      const today = clock.today();
      const scope = taskScope(actor);
      const [subtasks, comments, time, stages, deliverables] = await Promise.all([
        store.tasks.list({ scope: { kind: "all" }, parentTaskId: t.id }),
        store.tasks.listComments(t.id),
        store.time.list({ taskId: t.id }),
        store.projects.listStages([t.projectId]),
        t.engagementId && !t.parentTaskId ? store.engagements.listDeliverables(t.engagementId) : Promise.resolve([]),
      ]);
      void scope;
      const view = toView(actor, today);
      return ok({
        ...view(t),
        updatedAt: t.updatedAt,
        description: t.description,
        deliverableId: t.deliverableId,
        deliverables: deliverables.map((d) => ({ id: d.id, name: d.name })),
        reviewerName: t.reviewerName,
        createdAt: t.createdAt,
        subtasks: subtasks.sort((a, b) => (a.rank < b.rank ? -1 : 1)).map(view),
        comments,
        // Someone else's task: only your own entries (D15).
        time: time
          .filter((e) => seesAllHours(actor, t) || e.personId === actor.personId)
          .map((e) => ({ ...e, canEdit: (e.personId === actor.personId && !isTimeLocked(e.workDate, today)) || can(actor, "time.manage") })),
        stages: stages.map((s) => ({ id: s.id, name: s.name })),
        canManageTime: can(actor, "time.manage"),
        canAddSubtask: canCreate(actor) && !t.parentTaskId,
      });
    },

    async create(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!canCreate(actor)) return forbidden("Ask your lead to add tasks for you.");
      const parsed = parse(createTaskSchema, raw);
      if (!parsed.ok) return parsed;
      const input = parsed.value;
      return commit(store, async (repos) => {
        const project = await repos.projects.findById(input.projectId, taskScope(actor), clock.today());
        if (!project) return notFound("That project");
        { const blocked = await levelBlocks(repos, actor, project.clientId, "edit"); if (blocked) return blocked; }
        if (input.parentTaskId) {
          const parent = await repos.tasks.findById(input.parentTaskId, taskScope(actor));
          if (!parent || parent.projectId !== project.id) return invalid("A subtask must belong to a task in the same project.");
          if (parent.parentTaskId) return invalid("Subtasks can't have subtasks of their own (one level only).");
        }
        const outside = spaceGuard(repos);
        for (const personId of [input.ownerId, input.reviewerId]) {
          if (!personId) continue;
          const person = await repos.people.findById(personId);
          if (!person || person.status !== "active") return invalid("Pick someone on the team.", { ownerId: ["Pick someone on the team."] });
          if (await outside(personId, project.clientId)) return invalid(OUTSIDE_SPACE, { ownerId: [OUTSIDE_SPACE] });
        }
        if (input.stageId && !(await repos.projects.listStages([project.id])).some((s) => s.id === input.stageId)) {
          return invalid("Pick a stage of this project.");
        }
        // A double Enter or double click sends the same task twice (QA S9-02): one person's creates queue up, and the
        // same title in the same place within a few seconds is the first one, not a new task.
        await repos.people.lockForUpdate(actor.personId);
        const same = await repos.tasks.recentSame({ projectId: project.id, parentTaskId: input.parentTaskId, title: input.title, createdById: actor.personId, withinSeconds: DUPLICATE_WINDOW_SECONDS });
        if (same) return noChange({ id: same });
        const id = newId();
        const rank = generateKeyBetween(input.parentTaskId ? null : await repos.tasks.lastRank(project.id, "todo"), null);
        await repos.tasks.create(id, {
          projectId: project.id,
          clientId: project.clientId,
          parentTaskId: input.parentTaskId,
          title: input.title,
          description: input.description,
          status: "todo",
          priority: input.priority,
          ownerId: input.ownerId,
          reviewerId: input.reviewerId,
          stageId: input.stageId,
          deliverableId: null,
          startDate: input.startDate,
          dueDate: input.dueDate,
          estimateMinutes: input.estimateHours,
          completedAt: null,
          rank,
          recurrenceId: null,
          createdById: actor.personId,
        });
        return change({ id }, event(actor, { id, clientId: project.clientId }, "task.created", { title: input.title, ownerId: input.ownerId }));
      });
    },

    async update(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      const parsed = parse(updateTaskSchema, raw);
      if (!parsed.ok) return parsed;
      const { taskId, estimateHours, loadedAt, ...fields } = parsed.value;
      return commit(store, async (repos) => {
        const t = await repos.tasks.findById(taskId, taskScope(actor));
        if (!t) return notFound("That task");
        if (!canEdit(actor, t)) return forbidden("Only the task's owner, reviewer, creator or a lead can change it.");
        { const blocked = await levelBlocks(repos, actor, t.clientId, "edit"); if (blocked) return blocked; }
        // A form opened before someone else's save would put their change back (QA S8-B1): refuse and say why.
        if (loadedAt && t.updatedAt.getTime() > Date.parse(loadedAt)) {
          return conflict("This task changed since you opened it. Reload the page to see the latest, then make your change again.");
        }
        for (const personId of [fields.ownerId, fields.reviewerId]) {
          if (!personId || personId === t.ownerId || personId === t.reviewerId) continue;
          const person = await repos.people.findById(personId);
          if (!person || person.status !== "active") return invalid("Pick someone on the team.", { ownerId: ["Pick someone on the team."] });
          if (await spaceGuard(repos)(personId, t.clientId)) return invalid(OUTSIDE_SPACE, { ownerId: [OUTSIDE_SPACE] });
        }
        if (fields.stageId && fields.stageId !== t.stageId && !(await repos.projects.listStages([t.projectId])).some((s) => s.id === fields.stageId)) {
          return invalid("Pick a stage of this project.", { stageId: ["Pick a stage of this project."] });
        }
        // A task counts towards a promise of its own engagement only.
        if (fields.deliverableId && fields.deliverableId !== t.deliverableId) {
          const promised = t.engagementId ? await repos.engagements.listDeliverables(t.engagementId) : [];
          if (!promised.some((d) => d.id === fields.deliverableId)) return invalid("Pick one of this engagement's deliverables.", { deliverableId: ["Pick one of this engagement's deliverables."] });
        }
        const { deliverableId, ...rest } = fields;
        const patch = { ...rest, estimateMinutes: estimateHours, ...(deliverableId !== undefined ? { deliverableId } : {}) };
        const before: Record<string, unknown> = { ...t };
        const changed = Object.entries(patch).filter(([k, v]) => before[k] !== v).map(([k]) => k);
        if (changed.length === 0) return noChange({ id: taskId });
        await repos.tasks.update(taskId, patch);
        const action = changed.includes("ownerId") ? "task.reassigned" : "task.updated";
        // Before and after for every field changed in this save, owner included (test report M4, QA S2-B1); the notes
        // are only named, not copied into the history.
        const values = Object.fromEntries(changed.filter((k) => k !== "description").map((k) => [k, [before[k] ?? null, (patch as Record<string, unknown>)[k] ?? null]]));
        return change({ id: taskId }, event(actor, t, action, { fields: changed, values, ...(changed.includes("ownerId") ? { from: t.ownerId, to: fields.ownerId } : {}) }));
      });
    },

    /** Change status and/or position (Board drag, My Day "done"). */
    async move(actor: Actor, raw: unknown): Promise<Result<{ id: string; status: TaskStatus }>> {
      const parsed = parse(moveTaskSchema, raw);
      if (!parsed.ok) return parsed;
      const { taskId, status, afterId, beforeId, confirmed } = parsed.value;
      return commit(store, async (repos) => {
        const scope = taskScope(actor);
        const t = await repos.tasks.findById(taskId, scope);
        if (!t) return notFound("That task");
        if (!canEdit(actor, t)) return forbidden("Only the task's owner, reviewer, creator or a lead can move it.");
        { const blocked = await levelBlocks(repos, actor, t.clientId, "edit"); if (blocked) return blocked; }
        // Done while something is still open: say what, and ask to confirm (QA S9-03, the owner's default: warn).
        if (status === "done" && t.status !== "done" && !confirmed) {
          const open = await stillOpen(repos, t);
          if (open.length) return fail("conflict", `This task still has ${list(open)}. Mark it done anyway?`, { confirm: [`Still open: ${list(open)}.`] });
        }

        const [after, before] = await Promise.all([
          afterId ? repos.tasks.findById(afterId, scope) : null,
          beforeId ? repos.tasks.findById(beforeId, scope) : null,
        ]);
        let rank = t.rank;
        if (after || before || status !== t.status) {
          const lo = after?.rank ?? null;
          const hi = before?.rank ?? (after ? null : null);
          try {
            rank = lo || hi ? generateKeyBetween(lo, hi && lo && hi <= lo ? null : hi) : generateKeyBetween(await repos.tasks.lastRank(t.projectId, status), null);
          } catch {
            rank = generateKeyBetween(await repos.tasks.lastRank(t.projectId, status), null);
          }
        }
        const done = status === "done";
        await repos.tasks.update(taskId, { status, rank, completedAt: done ? (t.completedAt ?? clock.now()) : null });
        const action = status === t.status ? "task.reordered" : done ? "task.completed" : t.status === "done" ? "task.reopened" : "task.status_changed";
        return change({ id: taskId, status }, event(actor, t, action, { from: t.status, to: status, title: t.title }));
      });
    },

    async comment(actor: Actor, raw: unknown): Promise<Result<CommentRow>> {
      const parsed = parse(commentSchema, raw);
      if (!parsed.ok) return parsed;
      return commit(store, async (repos) => {
        const t = await repos.tasks.findById(parsed.value.taskId, taskScope(actor));
        if (!t) return notFound("That task");
        { const blocked = await levelBlocks(repos, actor, t.clientId, "comment"); if (blocked) return blocked; }
        const id = newId();
        await repos.tasks.addComment(id, t.id, actor.personId, parsed.value.body);
        // @mentions (Stage 9b.2): the mentioned watch the task from now on, so they can open it and hear what follows.
        const mentions = parsed.value.body.includes("@") ? findMentions(parsed.value.body, await repos.people.listActive()).filter((p) => p !== actor.personId) : [];
        if (mentions.length) {
          const onTask = new Set([t.ownerId, t.reviewerId, ...(await repos.tasks.people(t.id)).map((p) => p.personId)]);
          // In a private space only members (and the owner) can watch; a mention of anyone else adds nobody (Stage 14.1).
          const outside = spaceGuard(repos);
          for (const personId of mentions) if (!onTask.has(personId) && !(await outside(personId, t.clientId))) await repos.tasks.addPerson({ id: newId(), taskId: t.id, personId, role: "watcher", addedById: actor.personId });
        }
        const row: CommentRow = { id, taskId: t.id, authorId: actor.personId, authorName: actor.fullName, body: parsed.value.body, createdAt: clock.now() };
        return change(row, { ...event(actor, t, "task.commented"), data: { commentId: id, title: t.title, excerpt: parsed.value.body.slice(0, 140), mentions } });
      });
    },

    /** One-tap time: log minutes against a task for today (or a past day), as yourself. */
    async logTime(actor: Actor, raw: unknown): Promise<Result<{ id: string; loggedTodayMinutes: number }>> {
      const parsed = parse(logTimeSchema, raw);
      if (!parsed.ok) return parsed;
      const today = clock.today();
      const workDate = parsed.value.workDate ?? today;
      if (workDate > today) return invalid("Time can't be logged for a future day.", { workDate: ["Pick today or an earlier day."] });
      if (isTimeLocked(workDate, today) && !can(actor, "time.manage")) {
        return conflict("That month is closed for time (after the 5th of the next month). Ask your lead to add it.");
      }
      return commit(store, async (repos) => {
        const t = await repos.tasks.findById(parsed.value.taskId, taskScope(actor));
        if (!t) return notFound("That task");
        { const blocked = await levelBlocks(repos, actor, t.clientId, "edit"); if (blocked) return blocked; }
        const id = newId();
        await repos.time.add(id, {
          taskId: t.id,
          personId: actor.personId,
          clientId: t.clientId,
          engagementId: t.engagementId,
          workDate,
          minutes: parsed.value.minutes,
          // Internal work (no engagement) is never billable; client work defaults to billable (D26).
          billable: t.engagementId !== null,
          note: parsed.value.note,
        });
        const todays = await repos.time.list({ personId: actor.personId, from: today, to: today });
        return change(
          { id, loggedTodayMinutes: todays.reduce((s, e) => s + e.minutes, 0) },
          { actorId: actor.personId, action: "time.logged", entityType: "time_entry", entityId: id, clientId: t.clientId, data: { taskId: t.id, minutes: parsed.value.minutes, workDate } },
        );
      });
    },

    /** Remove a time entry: your own while the month is open, or anyone's with time.manage. */
    async removeTime(actor: Actor, entryId: string): Promise<Result<{ id: string }>> {
      if (!isId(entryId)) return notFound("That time entry");
      return commit(store, async (repos) => {
        const e = await repos.time.findById(entryId);
        if (!e) return notFound("That time entry");
        const mine = e.personId === actor.personId;
        if (!can(actor, "time.manage") && (!mine || isTimeLocked(e.workDate, clock.today()))) {
          return forbidden(mine ? "That month is closed for time. Ask your lead." : "You can only remove your own time.");
        }
        await repos.time.update(entryId, { deletedAt: clock.now() });
        return change({ id: entryId }, { actorId: actor.personId, action: "time.removed", entityType: "time_entry", entityId: entryId, clientId: e.clientId, data: { taskId: e.taskId, minutes: e.minutes, workDate: e.workDate } });
      });
    },

    /** Mark time non-billable (rework the client shouldn't pay for), or billable again. Leads only (D26). */
    async setBillable(actor: Actor, entryId: string, billable: boolean): Promise<Result<{ id: string }>> {
      if (!can(actor, "time.manage")) return forbidden("Only leads mark time as non-billable.");
      if (!isId(entryId)) return notFound("That time entry");
      return commit(store, async (repos) => {
        const e = await repos.time.findById(entryId);
        if (!e) return notFound("That time entry");
        await repos.time.update(entryId, { billable });
        return change({ id: entryId }, { actorId: actor.personId, action: billable ? "time.billable" : "time.non_billable", entityType: "time_entry", entityId: entryId, clientId: e.clientId });
      });
    },

    // ---------- Stage 9b: the list view, tags, bulk edit, saved views ----------

    /** Tasks as a sortable list (top-level tasks), up to 1,000. */
    async table(actor: Actor, f: TaskListFilter = {}): Promise<Result<{ tasks: TaskView[]; total: number; canCreate: boolean }>> {
      const today = clock.today();
      const statuses = f.status === "all" ? undefined : f.status === "done" ? (["done"] as TaskStatus[]) : TASK_STATUSES.includes(f.status as TaskStatus) ? [f.status as TaskStatus] : (["todo", "in_progress", "in_review", "blocked"] as TaskStatus[]);
      const filter: TaskFilter = {
        scope: taskScope(actor),
        ...(f.clientId && isId(f.clientId) ? { clientId: f.clientId } : {}),
        ...(f.projectId && isId(f.projectId) ? { projectId: f.projectId } : {}),
        ...(f.owner === "me" ? { assignedTo: actor.personId } : f.owner && isId(f.owner) ? { assignedTo: f.owner } : {}),
        ...(statuses ? { statuses } : {}),
        ...(TASK_PRIORITIES.includes(f.priority as TaskPriority) ? { priorities: [f.priority as TaskPriority] } : {}),
        ...(f.tag ? { tags: [f.tag] } : {}),
        // Words search subtasks too, like global search does (QA S9-21); without words the list stays top-level.
        ...(f.q ? { search: f.q.slice(0, 100), anyLevel: true } : {}),
        ...(f.due === "overdue" ? { dueTo: addDays(today, -1), statuses: (statuses ?? TASK_STATUSES).filter((s) => s !== "done") } : f.due === "today" ? { dueFrom: today, dueTo: today } : f.due === "week" ? { dueFrom: today, dueTo: addDays(today, 6) } : f.due === "none" ? { noDueDate: true } : {}),
        sort: { by: (TASK_SORTS as readonly string[]).includes(f.sort ?? "") ? (f.sort as TaskSort) : "due", dir: f.dir === "desc" ? "desc" : "asc" },
        limit: 1000,
      };
      const rows = await store.tasks.list(filter);
      return ok({ tasks: rows.map(toView(actor, today)), total: rows.length, canCreate: canCreate(actor) });
    },

    /** The tags on tasks this person can see, for filters and suggestions. */
    async tagOptions(actor: Actor): Promise<Array<{ tag: string; count: number }>> {
      return store.tasks.allTags(taskScope(actor));
    },

    async setTags(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      const parsed = parse(taskTagsSchema, raw);
      if (!parsed.ok) return parsed;
      const tags = await normaliseTags(parsed.value.tags);
      return commit(store, async (repos) => {
        const t = await repos.tasks.findById(parsed.value.taskId, taskScope(actor));
        if (!t) return notFound("That task");
        if (!canEdit(actor, t)) return forbidden("Only the task's owner, reviewer, creator or a lead can change it.");
        { const blocked = await levelBlocks(repos, actor, t.clientId, "edit"); if (blocked) return blocked; }
        if (JSON.stringify(t.tags ?? []) === JSON.stringify(tags)) return noChange({ id: t.id });
        await repos.tasks.update(t.id, { tags });
        return change({ id: t.id }, event(actor, t, "task.tagged", { tags }));
      });
    },

    /**
     * One change to many tasks (up to 200), saved together. Tasks this person may not change are skipped and counted,
     * never changed: the same rule as changing each one by hand.
     */
    async bulk(actor: Actor, raw: unknown): Promise<Result<{ changed: number; skipped: number }>> {
      const parsed = parse(bulkTaskSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      const tag = v.tag ? (await normaliseTags([v.tag]))[0]! : null;
      return commit(store, async (repos) => {
        const owner = v.action === "owner" && v.ownerId ? await repos.people.findById(v.ownerId) : null;
        if (v.action === "owner" && v.ownerId && (!owner || owner.status !== "active")) return invalid("Pick someone on the team.");
        const now = clock.now();
        const events: NewEvent[] = [];
        let skipped = 0;
        const ids = [...new Set(v.ids)];
        // One query for all of them, and each column's last rank asked once, then carried forward.
        const found = new Map((await repos.tasks.list({ scope: taskScope(actor), ids, limit: ids.length })).map((t) => [t.id, t]));
        const lastRanks = new Map<string, string | null>();
        const nextRank = async (projectId: string, status: TaskStatus) => {
          const key = `${projectId}:${status}`;
          const rank = generateKeyBetween(lastRanks.has(key) ? lastRanks.get(key)! : await repos.tasks.lastRank(projectId, status), null);
          lastRanks.set(key, rank);
          return rank;
        };
        const guard = spaceGuard(repos);
        for (const id of ids) {
          const t = found.get(id);
          if (!t || !canEdit(actor, t) || (await levelBlocks(repos, actor, t.clientId, "edit"))) {
            skipped++;
            continue;
          }
          let patch: Parameters<typeof repos.tasks.update>[1] | null = null;
          let action = "task.updated";
          let data: Record<string, unknown> = {};
          if (v.action === "status" && v.status && t.status !== v.status) {
            const done = v.status === "done";
            patch = { status: v.status, completedAt: done ? (t.completedAt ?? now) : null, rank: await nextRank(t.projectId, v.status) };
            action = done ? "task.completed" : t.status === "done" ? "task.reopened" : "task.status_changed";
            data = { from: t.status, to: v.status, title: t.title, bulk: true };
          } else if (v.action === "owner" && (t.ownerId ?? "") !== (v.ownerId ?? "")) {
            if (v.ownerId && (await guard(v.ownerId, t.clientId))) return invalid(`${OUTSIDE_SPACE} (${t.title})`);
            patch = { ownerId: v.ownerId || null };
            action = "task.reassigned";
            data = { from: t.ownerId, to: v.ownerId || null, bulk: true };
          } else if (v.action === "priority" && v.priority && t.priority !== v.priority) {
            patch = { priority: v.priority };
            data = { fields: ["priority"], values: { priority: [t.priority, v.priority] }, bulk: true };
          } else if (v.action === "due" && t.dueDate !== (v.dueDate || null)) {
            if (v.dueDate && t.startDate && v.dueDate < t.startDate) {
              skipped++;
              continue;
            }
            patch = { dueDate: v.dueDate || null };
            data = { fields: ["dueDate"], values: { dueDate: [t.dueDate, v.dueDate || null] }, bulk: true };
          } else if ((v.action === "tag_add" || v.action === "tag_remove") && tag) {
            const has = (t.tags ?? []).some((x) => x.toLowerCase() === tag.toLowerCase());
            if (v.action === "tag_add" && !has && (t.tags ?? []).length >= 10) {
              skipped++;
              continue;
            }
            if (v.action === "tag_add" && !has) patch = { tags: [...(t.tags ?? []), tag] };
            if (v.action === "tag_remove" && has) patch = { tags: (t.tags ?? []).filter((x) => x.toLowerCase() !== tag.toLowerCase()) };
            action = "task.tagged";
            data = { tags: patch?.tags, bulk: true };
          }
          if (!patch) continue;
          await repos.tasks.update(t.id, patch);
          events.push(event(actor, t, action, data));
        }
        if (!events.length) return noChange({ changed: 0, skipped });
        return change({ changed: events.length, skipped }, events[0]!, ...events.slice(1));
      });
    },

    async views(actor: Actor): Promise<SavedTaskView[]> {
      return store.tasks.views(actor.personId);
    },

    async saveView(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      const parsed = parse(z.object({ name: z.string().trim().min(1, { message: "Name the view." }).max(40), query: z.string().max(500) }), raw);
      if (!parsed.ok) return parsed;
      const q = new URLSearchParams(parsed.value.query);
      const keep = new URLSearchParams([...q].filter(([k, val]) => TASK_LIST_KEYS.includes(k as (typeof TASK_LIST_KEYS)[number]) && val));
      const id = newId();
      return commit(store, async (repos) => {
        const mine = await repos.tasks.views(actor.personId);
        // One name, one view (QA S2-B3), ignoring capitals and spaces at the ends.
        const taken = mine.find((v) => v.name.trim().toLowerCase() === parsed.value.name.toLowerCase());
        if (taken) return invalid(`You already have a view called "${taken.name}". Pick another name, or remove that one first.`, { name: [`You already have a view called "${taken.name}".`] });
        if (mine.length >= 12) return conflict("You have 12 saved views. Remove one first.");
        await repos.tasks.addView({ id, personId: actor.personId, name: parsed.value.name, query: keep.toString() });
        return change({ id }, { actorId: actor.personId, action: "task_view.saved", entityType: "task_view", entityId: id, personId: actor.personId, data: { name: parsed.value.name } });
      });
    },

    async removeView(actor: Actor, viewId: string): Promise<Result<null>> {
      if (!isId(viewId)) return notFound("That view");
      return commit(store, async (repos) => {
        if (!(await repos.tasks.removeView(viewId, actor.personId, clock.now()))) return notFound("That view");
        return change(null, { actorId: actor.personId, action: "task_view.removed", entityType: "task_view", entityId: viewId, personId: actor.personId });
      });
    },

    /** Soft-delete a task and its subtasks. Leads, or whoever created it. */
    async remove(actor: Actor, taskId: string): Promise<Result<{ id: string }>> {
      if (!isId(taskId)) return notFound("That task");
      return commit(store, async (repos) => {
        const t = await repos.tasks.findById(taskId, taskScope(actor));
        if (!t) return notFound("That task");
        if (!can(actor, "tasks.write.all") && t.createdById !== actor.personId) return forbidden("Only a lead or the person who created it can delete a task.");
        { const blocked = await levelBlocks(repos, actor, t.clientId, "edit"); if (blocked) return blocked; }
        const now = clock.now();
        const subtasks = await repos.tasks.list({ scope: { kind: "all" }, parentTaskId: t.id });
        for (const s of subtasks) await repos.tasks.update(s.id, { deletedAt: now });
        await repos.tasks.update(t.id, { deletedAt: now });
        return change({ id: t.id }, event(actor, t, "task.deleted", { title: t.title, subtasks: subtasks.length }));
      });
    },
  };
}

export type TaskService = ReturnType<typeof createTaskService>;

/** What the task list can filter and sort by (all optional, from the address). */
export const TASK_LIST_KEYS = ["q", "status", "owner", "clientId", "projectId", "priority", "tag", "due", "sort", "dir"] as const;
export type TaskListFilter = Partial<Record<(typeof TASK_LIST_KEYS)[number], string>>;

const PRIORITY_ORDER: Record<TaskPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
export const BOARD_ORDER: TaskStatus[] = ["todo", "in_progress", "in_review", "blocked", "done"];
