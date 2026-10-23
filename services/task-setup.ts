// Custom fields and templates (Stage 9b.4, ClickUp parity).
// Fields: leads (projects.write) define them for every client or one client; anyone who can change a task fills them.
// Templates: leads save a task or a whole project as a template; new tasks and projects start from one, with dates
// moved to the new start and checklists, subtasks, tags and stages copied.
import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";
import { z } from "zod";
import { addDays, diffDays, isIsoDate, type IsoDate } from "@/lib/dates";
import { isId, newId } from "@/lib/id";
import { forbidden, invalid, notFound, ok, type Result } from "@/lib/result";
import { TASK_FIELD_KINDS, TASK_PRIORITIES, type TaskFieldKind, type TemplateKind } from "@/lib/types";
import { id, isoDate, optionalId, optionalText, parse } from "@/lib/validation/common";
import type { DataStore, NewEvent, Repositories, TaskFieldRow, TemplateRow } from "@/repositories";
import { change, commit, noChange } from "./change";
import type { Clock } from "./clock";
import { can, clientScope, type Actor } from "./permissions";
import { OUTSIDE_SPACE, spaceGuard, levelBlocks } from "./spaces";
import { canCreateTasks, canEdit, taskScope } from "./tasks";

const LEADS_ONLY = "Only strategists and the owner set up fields and templates.";
const MAX_FIELDS = 40;
const MAX_TEMPLATE_TASKS = 200;

// ---------- custom fields ----------

const optionList = z
  .string()
  .optional()
  .transform((v) => [...new Set((v ?? "").split(/[\n,]/).map((o) => o.trim().replace(/\s+/g, " ")).filter(Boolean))])
  .refine((xs) => xs.length <= 50 && xs.every((x) => x.length <= 60), { message: "Up to 50 choices, each under 60 characters." });

const addFieldSchema = z
  .object({
    name: z.string().trim().min(1, { message: "Name the field." }).max(40, { message: "Keep the name under 40 characters." }),
    kind: z.enum(TASK_FIELD_KINDS),
    options: optionList,
    clientId: optionalId,
  })
  .refine((v) => v.kind !== "select" || v.options.length >= 2, { path: ["options"], message: "Give a dropdown at least two choices." });

const changeFieldSchema = z.object({
  fieldId: id,
  action: z.enum(["rename", "options", "up", "down", "remove"]),
  name: z.string().trim().max(40).optional(),
  options: optionList,
});

export type FieldWithValue = TaskFieldRow & { value: string | number | boolean | null };

/** A typed value from what a form sent, or an error. Empty clears it. */
export function readFieldValue(kind: TaskFieldKind, options: readonly string[], raw: string | undefined): { ok: true; value: string | number | boolean | null } | { ok: false; message: string } {
  const v = (raw ?? "").trim();
  if (kind === "checkbox") return { ok: true, value: v === "on" || v === "true" ? true : null };
  if (!v) return { ok: true, value: null };
  switch (kind) {
    case "text":
      return v.length <= 500 ? { ok: true, value: v } : { ok: false, message: "Keep it under 500 characters." };
    case "number": {
      const plain = v.replace(/,/g, "");
      const n = Number(plain);
      return /^-?\d+(\.\d+)?$/.test(plain) && Number.isFinite(n) && Math.abs(n) < 1e12 ? { ok: true, value: n } : { ok: false, message: "Type a number." };
    }
    case "date":
      return isIsoDate(v) ? { ok: true, value: v } : { ok: false, message: "Pick a date." };
    case "select":
      return options.includes(v) ? { ok: true, value: v } : { ok: false, message: "Pick one of the choices." };
    case "link":
      return URL.canParse(v) && new URL(v).protocol === "https:" && v.length <= 1000 ? { ok: true, value: v } : { ok: false, message: "Paste a link starting with https://" };
  }
}

// ---------- templates ----------

const priority = z.enum(TASK_PRIORITIES).catch("normal");
const steps = z.array(z.string().max(300)).max(100).catch([]);
const taskShape = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).nullable().catch(null),
  priority,
  estimateMinutes: z.number().int().min(0).max(100_000).nullable().catch(null),
  tags: z.array(z.string().max(30)).max(10).catch([]),
  checklist: steps,
  subtasks: z.array(z.object({ title: z.string().min(1).max(200), estimateMinutes: z.number().int().nullable().catch(null) })).max(50).catch([]),
  custom: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).catch({}),
});
/** What a task template holds. `dueAfterDays`: due this many days after it's created (null: no due date). */
const taskTemplateData = taskShape.extend({ dueAfterDays: z.number().int().min(0).max(3650).nullable().catch(null) });
/** What a project template holds: stages, and tasks with days counted from the project's start. */
const projectTemplateData = z.object({
  description: z.string().max(5000).nullable().catch(null),
  stages: z.array(z.string().min(1).max(60)).max(20).catch([]),
  /** The project's own due date as days from its start (test report L10); older templates don't have it. */
  endOffset: z.number().int().nullable().optional().catch(null),
  tasks: z.array(taskShape.extend({ startOffset: z.number().int().nullable().catch(null), dueOffset: z.number().int().nullable().catch(null), stagePosition: z.number().int().nullable().catch(null) })).max(MAX_TEMPLATE_TASKS),
});
export type TaskTemplateData = z.infer<typeof taskTemplateData>;
export type ProjectTemplateData = z.infer<typeof projectTemplateData>;

const saveTemplateSchema = z.object({
  sourceId: id,
  name: z.string().trim().min(2, { message: "Name the template." }).max(80),
  description: optionalText(500),
});
const taskFromTemplateSchema = z.object({
  templateId: id,
  projectId: id,
  title: optionalText(200),
  ownerId: optionalId,
  startDate: z.union([z.literal(""), isoDate]).optional().transform((v) => v || null),
});
const projectFromTemplateSchema = z.object({
  templateId: id,
  clientId: id,
  name: z.string().trim().min(2, { message: "Name the project." }).max(120),
  startDate: isoDate,
  leadId: optionalId,
});

export type TemplateSummary = Omit<TemplateRow, "data"> & { tasks: number; checklist: number; subtasks: number };

export function createTaskSetupService(deps: { store: DataStore; clock: Clock }) {
  const { store, clock } = deps;
  const lead = (actor: Actor) => can(actor, "projects.write");
  const visibleClients = async (actor: Actor) => new Set(await store.clients.visibleIds(clientScope(actor)));
  const sees = (t: TemplateRow, visible: ReadonlySet<string>) => {
    const from = typeof t.data.sourceClientId === "string" ? t.data.sourceClientId : null;
    return !from || visible.has(from);
  };
  const ev = (actor: Actor, action: string, entityType: NewEvent["entityType"], entityId: string, data: Record<string, unknown>, clientId?: string): NewEvent => ({
    actorId: actor.personId,
    action,
    entityType,
    entityId,
    ...(clientId ? { clientId } : {}),
    data,
  });

  /** A task's shape for a template: its checklist, subtasks, tags, custom values. */
  async function shapeOf(repos: Repositories, taskId: string) {
    const t = await repos.tasks.findById(taskId, { kind: "all" });
    if (!t) return null;
    const [checklist, subtasks] = await Promise.all([repos.tasks.checklist(t.id), repos.tasks.list({ scope: { kind: "all" }, parentTaskId: t.id })]);
    return {
      t,
      shape: {
        title: t.title.slice(0, 200),
        description: t.description?.slice(0, 5000) ?? null,
        priority: t.priority,
        estimateMinutes: t.estimateMinutes,
        tags: t.tags.slice(0, 10),
        // Kept within what a template holds, so nothing is dropped when it is read back.
        checklist: checklist.slice(0, 100).map((c) => c.text.slice(0, 300)),
        subtasks: subtasks.sort((a, b) => (a.rank < b.rank ? -1 : 1)).slice(0, 50).map((s) => ({ title: s.title.slice(0, 200), estimateMinutes: s.estimateMinutes })),
        custom: t.custom ?? {},
      },
    };
  }

  /** Writes one task from a template shape (with its checklist and subtasks). Returns its id. */
  async function writeTask(
    repos: Repositories,
    actor: Actor,
    at: { projectId: string; clientId: string; rank: string; stageId: string | null; ownerId: string | null; startDate: IsoDate | null; dueDate: IsoDate | null },
    shape: z.infer<typeof taskShape>,
    customFields: ReadonlySet<string>,
  ): Promise<string> {
    const taskId = newId();
    await repos.tasks.create(taskId, {
      projectId: at.projectId,
      clientId: at.clientId,
      parentTaskId: null,
      title: shape.title,
      description: shape.description,
      status: "todo",
      priority: shape.priority,
      ownerId: at.ownerId,
      reviewerId: null,
      stageId: at.stageId,
      deliverableId: null,
      startDate: at.startDate && at.dueDate && at.startDate > at.dueDate ? at.dueDate : at.startDate,
      dueDate: at.dueDate,
      estimateMinutes: shape.estimateMinutes,
      completedAt: null,
      rank: at.rank,
      recurrenceId: null,
      createdById: actor.personId,
    });
    // Only values for fields that still exist and apply to this client.
    const custom = Object.fromEntries(Object.entries(shape.custom).filter(([k]) => customFields.has(k)));
    if (shape.tags.length || Object.keys(custom).length) await repos.tasks.update(taskId, { tags: shape.tags, custom });
    let rank: string | null = null;
    for (const text of shape.checklist) {
      rank = generateKeyBetween(rank, null);
      await repos.tasks.addChecklistItem({ id: newId(), taskId, text, rank, createdById: actor.personId });
    }
    const subRanks = shape.subtasks.length ? generateNKeysBetween(null, null, shape.subtasks.length) : [];
    for (const [i, s] of shape.subtasks.entries()) {
      await repos.tasks.create(newId(), {
        projectId: at.projectId,
        clientId: at.clientId,
        parentTaskId: taskId,
        title: s.title,
        description: null,
        status: "todo",
        priority: "normal",
        ownerId: at.ownerId,
        reviewerId: null,
        stageId: null,
        deliverableId: null,
        startDate: null,
        dueDate: at.dueDate,
        estimateMinutes: s.estimateMinutes,
        completedAt: null,
        rank: subRanks[i]!,
        recurrenceId: null,
        createdById: actor.personId,
      });
    }
    return taskId;
  }

  const summary = (t: TemplateRow): TemplateSummary => {
    const { data, ...rest } = t;
    if (t.kind === "task") {
      const d = taskTemplateData.safeParse(data);
      return { ...rest, tasks: 1, checklist: d.success ? d.data.checklist.length : 0, subtasks: d.success ? d.data.subtasks.length : 0 };
    }
    const d = projectTemplateData.safeParse(data);
    return {
      ...rest,
      tasks: d.success ? d.data.tasks.length : 0,
      checklist: d.success ? d.data.tasks.reduce((n, x) => n + x.checklist.length, 0) : 0,
      subtasks: d.success ? d.data.tasks.reduce((n, x) => n + x.subtasks.length, 0) : 0,
    };
  };

  return {
    // ---------- fields ----------

    /** Fields for every client, plus those of clients this person can see. */
    async fields(actor: Actor): Promise<Result<{ fields: TaskFieldRow[]; canManage: boolean }>> {
      const visible = await visibleClients(actor);
      return ok({ fields: (await store.taskSetup.fields()).filter((f) => !f.clientId || visible.has(f.clientId)), canManage: lead(actor) });
    },

    async addField(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!lead(actor)) return forbidden(LEADS_ONLY);
      const parsed = parse(addFieldSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      return commit(store, async (repos) => {
        if (v.clientId && !(await repos.clients.findById(v.clientId, clientScope(actor)))) return notFound("That client");
        const all = await repos.taskSetup.fields();
        if (all.length >= MAX_FIELDS) return invalid(`Up to ${MAX_FIELDS} fields. Remove one first.`);
        if (all.some((f) => f.name.toLowerCase() === v.name.toLowerCase() && (f.clientId ?? null) === (v.clientId ?? null))) return invalid("There's already a field with that name.", { name: ["There's already a field with that name."] });
        const fieldId = newId();
        await repos.taskSetup.addField({ id: fieldId, name: v.name, kind: v.kind, options: v.kind === "select" ? v.options : [], clientId: v.clientId ?? null, position: all.length, createdById: actor.personId });
        return change({ id: fieldId }, ev(actor, "task_field.added", "task_field", fieldId, { name: v.name, kind: v.kind }, v.clientId ?? undefined));
      });
    },

    async changeField(actor: Actor, raw: unknown): Promise<Result<null>> {
      if (!lead(actor)) return forbidden(LEADS_ONLY);
      const parsed = parse(changeFieldSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      return commit(store, async (repos) => {
        const f = await repos.taskSetup.findField(v.fieldId);
        if (!f || (f.clientId && !(await repos.clients.findById(f.clientId, clientScope(actor))))) return notFound("That field");
        const data = { name: f.name };
        if (v.action === "rename") {
          if (!v.name) return invalid("Name the field.");
          if (v.name === f.name) return noChange(null);
          await repos.taskSetup.updateField(f.id, { name: v.name });
          return change(null, ev(actor, "task_field.renamed", "task_field", f.id, { from: f.name, to: v.name }));
        }
        if (v.action === "options") {
          if (f.kind !== "select") return invalid("Only dropdowns have choices.");
          if (v.options.length < 2) return invalid("Give a dropdown at least two choices.");
          await repos.taskSetup.updateField(f.id, { options: v.options });
          return change(null, ev(actor, "task_field.changed", "task_field", f.id, { ...data, options: v.options }));
        }
        if (v.action === "remove") {
          // Values stay on the tasks (history); the field just stops showing.
          await repos.taskSetup.updateField(f.id, { deletedAt: clock.now() });
          return change(null, ev(actor, "task_field.removed", "task_field", f.id, data));
        }
        const all = await repos.taskSetup.fields();
        const i = all.findIndex((x) => x.id === f.id);
        const j = v.action === "up" ? i - 1 : i + 1;
        if (j < 0 || j >= all.length) return noChange(null);
        const order = [...all];
        [order[i], order[j]] = [order[j]!, order[i]!];
        for (const [position, x] of order.entries()) if (x.position !== position) await repos.taskSetup.updateField(x.id, { position });
        return change(null, ev(actor, "task_field.moved", "task_field", f.id, data));
      });
    },

    /** The fields a task shows (everyone's plus its client's), with its values. */
    async forTask(actor: Actor, taskId: string): Promise<Result<{ fields: FieldWithValue[]; canEdit: boolean }>> {
      const t = isId(taskId) ? await store.tasks.findById(taskId, taskScope(actor)) : null;
      if (!t) return notFound("That task");
      const fields = await store.taskSetup.fields(t.clientId);
      return ok({ fields: fields.map((f) => ({ ...f, value: t.custom?.[f.id] ?? null })), canEdit: canEdit(actor, t) });
    },

    /** Saves the task's field values from a form (`field:<id>` keys). Only changed ones are recorded. */
    async setValues(actor: Actor, taskId: string, raw: Record<string, string | undefined>): Promise<Result<{ changed: number }>> {
      if (!isId(taskId)) return notFound("That task");
      return commit(store, async (repos) => {
        const t = await repos.tasks.findById(taskId, taskScope(actor));
        if (!t) return notFound("That task");
        if (!canEdit(actor, t)) return forbidden("Only the task's owner, assignees, reviewer, creator or a lead can change it.");
        { const blocked = await levelBlocks(repos, actor, t.clientId, "edit"); if (blocked) return blocked; }
        const fields = await repos.taskSetup.fields(t.clientId);
        const next = { ...(t.custom ?? {}) };
        const errors: Record<string, string[]> = {};
        const changed: string[] = [];
        for (const f of fields) {
          const key = `field:${f.id}`;
          // A checkbox sends nothing when unticked: only forms that showed it (with its marker) may clear it.
          if (f.kind === "checkbox" ? !(`shown:${f.id}` in raw) : !(key in raw)) continue;
          const r = readFieldValue(f.kind, f.options, raw[key]);
          if (!r.ok) {
            errors[key] = [r.message];
            continue;
          }
          const before = next[f.id] ?? null;
          if (before === r.value) continue;
          if (r.value === null) delete next[f.id];
          else next[f.id] = r.value;
          changed.push(f.name);
        }
        if (Object.keys(errors).length) return invalid("Check the highlighted fields.", errors);
        if (!changed.length) return noChange({ changed: 0 });
        await repos.tasks.update(t.id, { custom: next });
        return change({ changed: changed.length }, ev(actor, "task.fields_changed", "task", t.id, { fields: changed, title: t.title }, t.clientId));
      });
    },

    // ---------- templates ----------

    /** Templates made from work of clients this person can see (a template carries that client's details). */
    async templates(actor: Actor, kind: TemplateKind): Promise<Result<{ templates: TemplateSummary[]; canManage: boolean }>> {
      const visible = await visibleClients(actor);
      return ok({ templates: (await store.taskSetup.templates(kind)).filter((t) => sees(t, visible)).map(summary), canManage: lead(actor) });
    },

    /** Save a task (with its checklist, subtasks, tags and field values) as a template. */
    async saveTaskTemplate(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!lead(actor)) return forbidden(LEADS_ONLY);
      const parsed = parse(saveTemplateSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      return commit(store, async (repos) => {
        if (!(await repos.tasks.findById(v.sourceId, taskScope(actor)))) return notFound("That task");
        const got = await shapeOf(repos, v.sourceId);
        if (!got) return notFound("That task");
        const { t, shape } = got;
        const data: TaskTemplateData & { sourceClientId: string } = { sourceClientId: t.clientId, ...shape, dueAfterDays: t.dueDate ? (t.startDate ? Math.max(0, diffDays(t.startDate, t.dueDate)) : 0) : null };
        const templateId = newId();
        await repos.taskSetup.addTemplate({ id: templateId, kind: "task", name: v.name, description: v.description, data, createdById: actor.personId });
        return change({ id: templateId }, ev(actor, "template.saved", "template", templateId, { kind: "task", name: v.name, from: t.id }));
      });
    },

    /** Save a whole project (stages, its top-level tasks with dates as days from its start) as a template. */
    async saveProjectTemplate(actor: Actor, raw: unknown): Promise<Result<{ id: string; tasks: number }>> {
      if (!lead(actor)) return forbidden(LEADS_ONLY);
      const parsed = parse(saveTemplateSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      return commit(store, async (repos) => {
        const project = await repos.projects.findById(v.sourceId, taskScope(actor), clock.today());
        if (!project) return notFound("That project");
        const [stages, rows] = await Promise.all([repos.projects.listStages([project.id]), repos.tasks.list({ scope: { kind: "all" }, projectId: project.id, sort: { by: "due", dir: "asc" } })]);
        if (rows.length > MAX_TEMPLATE_TASKS) return invalid(`A template holds up to ${MAX_TEMPLATE_TASKS} tasks; this project has ${rows.length}.`);
        const dates = rows.flatMap((r) => [r.startDate, r.dueDate]).filter((d): d is IsoDate => Boolean(d)).sort();
        const base = project.startDate ?? dates[0] ?? clock.today();
        const stageOrder = stages.sort((a, b) => a.position - b.position);
        const tasks: ProjectTemplateData["tasks"] = [];
        for (const r of rows) {
          const got = await shapeOf(repos, r.id);
          if (!got) continue;
          const pos = r.stageId ? stageOrder.findIndex((s) => s.id === r.stageId) : -1;
          tasks.push({ ...got.shape, startOffset: r.startDate ? diffDays(base, r.startDate) : null, dueOffset: r.dueDate ? diffDays(base, r.dueDate) : null, stagePosition: pos >= 0 && pos < 20 ? pos : null });
        }
        const endOffset = project.dueDate && project.dueDate >= base ? diffDays(base, project.dueDate) : null;
        const data: ProjectTemplateData & { sourceClientId: string } = { sourceClientId: project.clientId, description: null, stages: stageOrder.slice(0, 20).map((s) => s.name.slice(0, 60)), endOffset, tasks };
        const templateId = newId();
        await repos.taskSetup.addTemplate({ id: templateId, kind: "project", name: v.name, description: v.description, data, createdById: actor.personId });
        return change({ id: templateId, tasks: tasks.length }, ev(actor, "template.saved", "template", templateId, { kind: "project", name: v.name, from: project.id, tasks: tasks.length }));
      });
    },

    /** A new task in a project from a task template. Same rights as adding a task there. */
    async createTask(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!canCreateTasks(actor)) return forbidden("Ask your lead to add tasks for you.");
      const parsed = parse(taskFromTemplateSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      return commit(store, async (repos) => {
        const [template, project] = await Promise.all([repos.taskSetup.findTemplate(v.templateId), repos.projects.findById(v.projectId, taskScope(actor), clock.today())]);
        if (!template || template.kind !== "task" || !sees(template, await visibleClients(actor))) return notFound("That template");
        if (!project) return notFound("That project");
        { const blocked = await levelBlocks(repos, actor, project.clientId, "edit"); if (blocked) return blocked; }
        const d = taskTemplateData.safeParse(template.data);
        if (!d.success) return invalid("That template can't be read. Save it again.");
        if (v.ownerId) {
          const owner = await repos.people.findById(v.ownerId);
          if (!owner || owner.status !== "active") return invalid("Pick someone on the team.", { ownerId: ["Pick someone on the team."] });
          if (await spaceGuard(repos)(v.ownerId, project.clientId)) return invalid(OUTSIDE_SPACE, { ownerId: [OUTSIDE_SPACE] });
        }
        const start = v.startDate ?? clock.today();
        const fields = new Set((await repos.taskSetup.fields(project.clientId)).map((f) => f.id));
        const taskId = await writeTask(
          repos,
          actor,
          {
            projectId: project.id,
            clientId: project.clientId,
            rank: generateKeyBetween(await repos.tasks.lastRank(project.id, "todo"), null),
            stageId: null,
            ownerId: v.ownerId ?? null,
            startDate: v.startDate ?? (d.data.dueAfterDays !== null ? start : null),
            dueDate: d.data.dueAfterDays !== null ? addDays(start, d.data.dueAfterDays) : null,
          },
          { ...d.data, title: v.title ?? d.data.title },
          fields,
        );
        return change({ id: taskId }, ev(actor, "task.created", "task", taskId, { title: v.title ?? d.data.title, ownerId: v.ownerId ?? null, template: template.name }, project.clientId));
      });
    },

    /** A new project for a client from a project template: its stages and tasks, dates from the start you pick. */
    async createProject(actor: Actor, raw: unknown): Promise<Result<{ id: string; tasks: number }>> {
      if (!lead(actor)) return forbidden("Only strategists and the owner start projects.");
      const parsed = parse(projectFromTemplateSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      return commit(store, async (repos) => {
        const [template, client] = await Promise.all([repos.taskSetup.findTemplate(v.templateId), repos.clients.findById(v.clientId, clientScope(actor))]);
        if (!template || template.kind !== "project" || !sees(template, await visibleClients(actor))) return notFound("That template");
        if (!client) return notFound("That client");
        const d = projectTemplateData.safeParse(template.data);
        if (!d.success) return invalid("That template can't be read. Save it again.");
        if (v.leadId) {
          const p = await repos.people.findById(v.leadId);
          if (!p || p.status !== "active") return invalid("Pick someone on the team.", { leadId: ["Pick someone on the team."] });
        }
        const projectId = newId();
        const dues = d.data.tasks.map((t) => t.dueOffset).filter((x): x is number => x !== null);
        await repos.projects.create(projectId, {
          clientId: client.id,
          engagementId: null,
          name: v.name,
          description: d.data.description,
          status: "active",
          leadId: v.leadId ?? client.leadStrategist?.id ?? actor.personId,
          startDate: v.startDate,
          // The project's end moves by the same offset as its tasks; never before its last task is due.
          dueDate: d.data.endOffset != null || dues.length ? addDays(v.startDate, Math.max(d.data.endOffset ?? 0, ...dues)) : null,
          createdById: actor.personId,
        });
        const names = d.data.stages.length ? d.data.stages : ["To plan", "Doing", "Wrapping up"];
        const stages = names.map((name, position) => ({ id: newId(), projectId, name, position }));
        await repos.projects.createStages(stages);
        await repos.projects.update(projectId, { currentStageId: stages[0]!.id });
        const fields = new Set((await repos.taskSetup.fields(client.id)).map((f) => f.id));
        const ranks = d.data.tasks.length ? generateNKeysBetween(null, null, d.data.tasks.length) : [];
        for (const [i, t] of d.data.tasks.entries()) {
          await writeTask(
            repos,
            actor,
            {
              projectId,
              clientId: client.id,
              rank: ranks[i]!,
              stageId: t.stagePosition !== null ? (stages[t.stagePosition]?.id ?? null) : null,
              ownerId: null,
              startDate: t.startOffset !== null ? addDays(v.startDate, t.startOffset) : null,
              dueDate: t.dueOffset !== null ? addDays(v.startDate, t.dueOffset) : null,
            },
            t,
            fields,
          );
        }
        return change({ id: projectId, tasks: d.data.tasks.length }, ev(actor, "project.created", "project", projectId, { name: v.name, template: template.name, tasks: d.data.tasks.length }, client.id));
      });
    },

    async removeTemplate(actor: Actor, templateId: string): Promise<Result<null>> {
      if (!lead(actor)) return forbidden(LEADS_ONLY);
      if (!isId(templateId)) return notFound("That template");
      return commit(store, async (repos) => {
        const t = await repos.taskSetup.findTemplate(templateId);
        if (!t) return notFound("That template");
        await repos.taskSetup.removeTemplate(t.id, clock.now());
        return change(null, ev(actor, "template.removed", "template", t.id, { kind: t.kind, name: t.name }));
      });
    },
  };
}

export type TaskSetupService = ReturnType<typeof createTaskSetupService>;
