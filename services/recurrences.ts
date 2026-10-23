// Recurring tasks (D35, D71): a rule on a project makes a real task for each due date, two weeks ahead.
// The daily job keeps every live rule filled; changing a rule replaces the open tasks nobody has touched yet.

import { generateNKeysBetween } from "fractional-indexing";
import { addDays, maxDate, type IsoDate } from "@/lib/dates";
import { isId, newId } from "@/lib/id";
import { forbidden, invalid, notFound, ok, type Result } from "@/lib/result";
import { parse } from "@/lib/validation/common";
import { createRecurrenceSchema, recurrenceActiveSchema, recurrenceIdSchema, updateRecurrenceSchema } from "@/lib/validation/recurrences";
import type { DataStore, DeliverableRecord, NewEvent, PersonRef, ProjectRow, RecurrenceRow, RecurrenceWrite, Repositories, StageRow, TaskRow } from "@/repositories";
import { change, commit, noChange } from "./change";
import type { Clock } from "./clock";
import { can, type Actor } from "./permissions";
import { OUTSIDE_SPACE, spaceGuard, levelBlocks } from "./spaces";
import { dueDates, describeSchedule, HORIZON_DAYS, startDateFor } from "./rules/recurrence";
import { DEFAULT_WORK_WEEK, type WorkWeek } from "./rules/working-days";
import { projectScope } from "./projects";
import { taskScope } from "./tasks";

export type RecurrenceView = RecurrenceRow & { schedule: string };

export type ProjectRecurrences = {
  rules: RecurrenceView[];
  canManage: boolean;
  /** For the rule form (canManage only). */
  options?: { people: PersonRef[]; stages: StageRow[]; deliverables: DeliverableRecord[] };
};

const DENIED = "Only strategists, performance marketers and the owner set up recurring tasks.";
/** Changing these moves the dates, so the open untouched tasks are replaced. */
const SCHEDULE_FIELDS = ["frequency", "weekday", "dayOfMonth", "leadWorkingDays", "startsOn", "endsOn"] as const;
/** Changing these is copied onto the open untouched tasks. */
const TASK_FIELDS = ["title", "description", "ownerId", "reviewerId", "priority", "stageId", "deliverableId", "estimateMinutes"] as const;

/** An open task nobody has started, logged time on, discussed or split: safe to change or replace. */
const untouched = (t: TaskRow, today: IsoDate) =>
  t.status === "todo" && (t.dueDate ?? "") > today && t.loggedMinutes === 0 && t.commentCount === 0 && t.subtasksTotal === 0;

export function createRecurrenceService(deps: { store: DataStore; clock: Clock }) {
  const { store, clock } = deps;

  async function calendar(repos: Repositories, from: IsoDate, to: IsoDate) {
    const week = (await repos.calendar.getSetting<WorkWeek>("work_week")) ?? DEFAULT_WORK_WEEK;
    const holidays = new Set((await repos.calendar.listHolidays(addDays(from, -45), to)).map((h) => h.date));
    return { week, holidays };
  }

  /**
   * Make the rule's tasks from where it got to (never before today) up to two weeks ahead. Due dates that already
   * have a live task are skipped by the database, so this is safe to repeat. Returns the events to record.
   */
  async function fill(repos: Repositories, rule: RecurrenceRow, today: IsoDate, actorId: string | null): Promise<NewEvent[]> {
    if (!rule.active) return [];
    const to = addDays(today, HORIZON_DAYS);
    const from = maxDate(today, rule.generatedUntil ? addDays(rule.generatedUntil, 1) : rule.startsOn);
    if (from > to) return [];
    const { week, holidays } = await calendar(repos, from, to);
    // A date moved back off a holiday could land before today; it's skipped rather than born late.
    const dates = dueDates(rule, from, to, week, holidays).filter((d) => d >= today);

    const events: NewEvent[] = [];
    if (dates.length) {
      const owner = rule.ownerId ? await repos.people.findById(rule.ownerId) : null;
      const ownerId = owner?.status === "active" ? owner.id : null;
      const ranks = generateNKeysBetween(await repos.tasks.lastRank(rule.projectId, "todo"), null, dates.length);
      const rows = dates.map((due, i) => ({
        id: newId(),
        projectId: rule.projectId,
        clientId: rule.clientId,
        parentTaskId: null,
        title: rule.title,
        description: rule.description,
        status: "todo" as const,
        priority: rule.priority,
        ownerId,
        reviewerId: rule.reviewerId,
        stageId: rule.stageId,
        deliverableId: rule.deliverableId,
        startDate: startDateFor(due, rule.leadWorkingDays, week, holidays),
        dueDate: due,
        estimateMinutes: rule.estimateMinutes,
        completedAt: null,
        rank: ranks[i]!,
        recurrenceId: rule.id,
        recurrenceDate: due,
        // The person who set the rule up stands behind its tasks.
        createdById: rule.createdById ?? actorId,
      }));
      const inserted = new Set(await repos.tasks.createMany(rows));
      for (const r of rows.filter((x) => inserted.has(x.id))) {
        events.push({ actorId, action: "task.created", entityType: "task", entityId: r.id, clientId: r.clientId, data: { title: r.title, recurring: true, dueDate: r.dueDate } });
      }
    }
    // Only moves when tasks were made: a run that makes nothing changes nothing (and simply looks again tomorrow).
    if (events.length) await repos.projects.updateRecurrence(rule.id, { generatedUntil: to });
    return events;
  }

  /** The rule's open tasks after today that nobody has touched. */
  async function untouchedTasks(repos: Repositories, rule: RecurrenceRow, today: IsoDate) {
    const tasks = await repos.tasks.list({ scope: { kind: "all" }, recurrenceId: rule.id, projectId: rule.projectId, dueFrom: addDays(today, 1), statuses: ["todo"] });
    return tasks.filter((t) => untouched(t, today));
  }

  async function removeTasks(repos: Repositories, tasks: TaskRow[], actorId: string): Promise<NewEvent[]> {
    const now = clock.now();
    for (const t of tasks) await repos.tasks.update(t.id, { deletedAt: now });
    return tasks.map((t) => ({ actorId, action: "task.deleted", entityType: "task", entityId: t.id, clientId: t.clientId, data: { title: t.title, recurring: true } }));
  }

  /** The project if the person can see it; when `manage`, they must also be able to plan work. */
  async function project(repos: Repositories, actor: Actor, projectId: string): Promise<ProjectRow | null> {
    if (!isId(projectId)) return null;
    return repos.projects.findById(projectId, projectScope(actor), clock.today());
  }

  async function checkRefs(repos: Repositories, p: ProjectRow, input: { ownerId: string | null; reviewerId: string | null; stageId: string | null; deliverableId: string | null }) {
    for (const key of ["ownerId", "reviewerId"] as const) {
      const id = input[key];
      if (!id) continue;
      const person = await repos.people.findById(id);
      if (!person || person.status !== "active") return invalid("Pick someone on the team.", { [key]: ["Pick someone on the team."] });
      if (await spaceGuard(repos)(id, p.clientId)) return invalid(OUTSIDE_SPACE, { [key]: [OUTSIDE_SPACE] });
    }
    if (input.stageId && !(await repos.projects.listStages([p.id])).some((s) => s.id === input.stageId)) {
      return invalid("Pick one of this project's stages.", { stageId: ["Pick one of this project's stages."] });
    }
    if (input.deliverableId && (!p.engagementId || !(await repos.engagements.listDeliverables(p.engagementId)).some((d) => d.id === input.deliverableId))) {
      return invalid("Pick one of this engagement's deliverables.", { deliverableId: ["Pick one of this engagement's deliverables."] });
    }
    return null;
  }

  const describe = (r: RecurrenceRow): RecurrenceView => ({ ...r, schedule: describeSchedule(r) });

  return {
    async list(actor: Actor, projectId: string): Promise<Result<ProjectRecurrences>> {
      const p = await project(store, actor, projectId);
      if (!p) return notFound("That project");
      const canManage = can(actor, "projects.write");
      // People who see only their own tasks (interns) see only the rules that make tasks for them (D13).
      const own = taskScope(actor).kind === "own";
      const rules = (await store.projects.listRecurrences({ projectId: p.id }))
        .filter((r) => !own || r.ownerId === actor.personId || r.reviewerId === actor.personId)
        .map(describe);
      if (!canManage) return ok({ rules, canManage });
      const [people, stages, deliverables] = await Promise.all([
        store.people.listActive(),
        store.projects.listStages([p.id]),
        p.engagementId ? store.engagements.listDeliverables(p.engagementId) : Promise.resolve([]),
      ]);
      return ok({ rules, canManage, options: { people: people.map((x) => ({ id: x.id, fullName: x.fullName })), stages, deliverables } });
    },

    async create(actor: Actor, raw: unknown): Promise<Result<{ id: string; tasks: number }>> {
      if (!can(actor, "projects.write")) return forbidden(DENIED);
      const parsed = parse(createRecurrenceSchema, raw);
      if (!parsed.ok) return parsed;
      const { estimateHours, projectId, ...input } = parsed.value;
      const today = clock.today();
      return commit(store, async (repos) => {
        const p = await project(repos, actor, projectId);
        if (!p) return notFound("That project");
        { const blocked = await levelBlocks(repos, actor, p.clientId, "edit"); if (blocked) return blocked; }
        const bad = await checkRefs(repos, p, input);
        if (bad) return bad;
        const id = newId();
        const rule: RecurrenceWrite = { ...input, projectId: p.id, clientId: p.clientId, estimateMinutes: estimateHours, active: true, createdById: actor.personId };
        await repos.projects.createRecurrence(id, rule);
        const created = await repos.projects.findRecurrence(id);
        const taskEvents = await fill(repos, created!, today, actor.personId);
        return change(
          { id, tasks: taskEvents.length },
          { actorId: actor.personId, action: "task_recurrence.created", entityType: "task_recurrence", entityId: id, clientId: p.clientId, data: { title: rule.title, schedule: describeSchedule(rule) } },
          ...taskEvents,
        );
      });
    },

    /** Changes apply from today: open, untouched tasks already made are updated, or replaced when dates move. */
    async update(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "projects.write")) return forbidden(DENIED);
      const parsed = parse(updateRecurrenceSchema, raw);
      if (!parsed.ok) return parsed;
      const { estimateHours, recurrenceId, ...input } = parsed.value;
      const today = clock.today();
      return commit(store, async (repos) => {
        const before = isId(recurrenceId) ? await repos.projects.lockRecurrence(recurrenceId) : null;
        const p = before ? await project(repos, actor, before.projectId) : null;
        if (!before || !p) return notFound("That recurring task");
        { const blocked = await levelBlocks(repos, actor, p.clientId, "edit"); if (blocked) return blocked; }
        const bad = await checkRefs(repos, p, input);
        if (bad) return bad;
        const after = { ...before, ...input, estimateMinutes: estimateHours };
        const changed = [...SCHEDULE_FIELDS, ...TASK_FIELDS].filter((k) => after[k] !== before[k]);
        if (changed.length === 0) return noChange({ id: before.id });

        const events: NewEvent[] = [];
        const open = await untouchedTasks(repos, before, today);
        const rescheduled = changed.some((k) => (SCHEDULE_FIELDS as readonly string[]).includes(k));
        if (rescheduled) {
          events.push(...(await removeTasks(repos, open, actor.personId)));
          await repos.projects.updateRecurrence(before.id, { ...input, estimateMinutes: estimateHours, generatedUntil: addDays(today, -1) });
        } else {
          await repos.projects.updateRecurrence(before.id, { ...input, estimateMinutes: estimateHours });
          const owner = after.ownerId ? await repos.people.findById(after.ownerId) : null;
          for (const t of open) {
            await repos.tasks.update(t.id, {
              title: after.title,
              description: after.description,
              ownerId: owner?.status === "active" ? owner.id : null,
              reviewerId: after.reviewerId,
              priority: after.priority,
              stageId: after.stageId,
              deliverableId: after.deliverableId,
              estimateMinutes: after.estimateMinutes,
            });
            events.push({ actorId: actor.personId, action: "task.updated", entityType: "task", entityId: t.id, clientId: t.clientId, data: { title: after.title, fields: changed, recurring: true } });
          }
        }
        const fresh = await repos.projects.findRecurrence(before.id);
        events.push(...(await fill(repos, fresh!, today, actor.personId)));
        return change(
          { id: before.id },
          { actorId: actor.personId, action: "task_recurrence.updated", entityType: "task_recurrence", entityId: before.id, clientId: before.clientId, data: { title: after.title, fields: changed } },
          ...events,
        );
      });
    },

    /** Pause (its open untouched tasks go) or resume (filled again from today). */
    async setActive(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "projects.write")) return forbidden(DENIED);
      const parsed = parse(recurrenceActiveSchema, raw);
      if (!parsed.ok) return parsed;
      const today = clock.today();
      return commit(store, async (repos) => {
        const rule = await repos.projects.lockRecurrence(parsed.value.recurrenceId);
        if (!rule || !(await project(repos, actor, rule.projectId))) return notFound("That recurring task");
        { const blocked = await levelBlocks(repos, actor, rule.clientId, "edit"); if (blocked) return blocked; }
        if (rule.active === parsed.value.active) return noChange({ id: rule.id });
        const events: NewEvent[] = [];
        if (parsed.value.active) {
          await repos.projects.updateRecurrence(rule.id, { active: true, generatedUntil: addDays(today, -1) });
          events.push(...(await fill(repos, { ...rule, active: true, generatedUntil: addDays(today, -1) }, today, actor.personId)));
        } else {
          await repos.projects.updateRecurrence(rule.id, { active: false });
          events.push(...(await removeTasks(repos, await untouchedTasks(repos, rule, today), actor.personId)));
        }
        return change(
          { id: rule.id },
          { actorId: actor.personId, action: parsed.value.active ? "task_recurrence.resumed" : "task_recurrence.paused", entityType: "task_recurrence", entityId: rule.id, clientId: rule.clientId, data: { title: rule.title } },
          ...events,
        );
      });
    },

    async remove(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "projects.write")) return forbidden(DENIED);
      const parsed = parse(recurrenceIdSchema, raw);
      if (!parsed.ok) return parsed;
      const today = clock.today();
      return commit(store, async (repos) => {
        const rule = await repos.projects.lockRecurrence(parsed.value.recurrenceId);
        if (!rule || !(await project(repos, actor, rule.projectId))) return notFound("That recurring task");
        { const blocked = await levelBlocks(repos, actor, rule.clientId, "edit"); if (blocked) return blocked; }
        await repos.projects.updateRecurrence(rule.id, { active: false, deletedAt: clock.now() });
        const events = await removeTasks(repos, await untouchedTasks(repos, rule, today), actor.personId);
        return change(
          { id: rule.id },
          { actorId: actor.personId, action: "task_recurrence.removed", entityType: "task_recurrence", entityId: rule.id, clientId: rule.clientId, data: { title: rule.title } },
          ...events,
        );
      });
    },

    /** The daily job (system): fill every live rule two weeks ahead. One rule failing doesn't stop the rest. */
    async runDaily(): Promise<{ rules: number; tasks: number; errors: unknown[] }> {
      const today = clock.today();
      const rules = await store.projects.listRecurrences({ liveOnly: true });
      let tasks = 0;
      const errors: unknown[] = [];
      for (const listed of rules) {
        try {
          const r = await commit(store, async (repos) => {
            // Read fresh under the lock: a rule paused, changed or removed since the list was read is respected.
            const rule = await repos.projects.lockRecurrence(listed.id);
            const events = rule ? await fill(repos, rule, today, null) : [];
            return events.length ? change(events.length, ...(events as [NewEvent, ...NewEvent[]])) : noChange(0);
          });
          if (r.ok) tasks += r.value;
        } catch (err) {
          errors.push(err);
        }
      }
      return { rules: rules.length, tasks, errors };
    },
  };
}

export type RecurrenceService = ReturnType<typeof createRecurrenceService>;
