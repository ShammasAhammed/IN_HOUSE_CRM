// Projects: delivery inside an engagement, with stages (plan/3-projects-module.md, D20).
// A new project copies its service's stages and, if asked, its starter tasks (D19).

import { generateNKeysBetween } from "fractional-indexing";
import { addDays, type IsoDate } from "@/lib/dates";
import { isId, newId } from "@/lib/id";
import { forbidden, invalid, notFound, ok, type Result } from "@/lib/result";
import type { ProjectStatus, Role } from "@/lib/types";
import { parse } from "@/lib/validation/common";
import { createProjectSchema, projectStageSchema, projectStatusSchema } from "@/lib/validation/projects";
import type { DataStore, NewEvent, ProjectRow, StageRow, TaskScope } from "@/repositories";
import { change, commit, noChange } from "./change";
import type { Clock } from "./clock";
import { can, clientScope, everything, type Actor } from "./permissions";
import { levelBlocks } from "./spaces";
import { previousWorkingDay, DEFAULT_WORK_WEEK, type WorkWeek } from "./rules/working-days";
import { taskScope } from "./tasks";

export type ProjectView = ProjectRow & {
  stages: StageRow[];
  /** Open, late and done counts cover everyone's tasks: not shown to people who see only their own (interns). */
  countsVisible: boolean;
};

/**
 * Which projects a person may see: all for people who see all work or all projects (the BDO, D13), otherwise the
 * same as their tasks.
 */
export function projectScope(actor: Actor): TaskScope {
  return can(actor, "projects.read.all") ? everything(actor) : taskScope(actor);
}

export function createProjectService(deps: { store: DataStore; clock: Clock }) {
  const { store, clock } = deps;

  return {
    async list(actor: Actor, filter: { clientId?: string; statuses?: ProjectStatus[] } = {}): Promise<Result<ProjectView[]>> {
      const rows = await store.projects.list({
        scope: projectScope(actor),
        today: clock.today(),
        ...(filter.clientId ? { clientIds: [filter.clientId] } : {}),
        ...(filter.statuses ? { statuses: filter.statuses } : {}),
      });
      const stages = await store.projects.listStages(rows.map((r) => r.id));
      const countsVisible = projectScope(actor).kind !== "own";
      return ok(rows.map((r) => ({ ...r, stages: stages.filter((s) => s.projectId === r.id), countsVisible })));
    },

    async get(actor: Actor, projectId: string): Promise<Result<ProjectView>> {
      if (!isId(projectId)) return notFound("That project");
      const scope = projectScope(actor);
      const row = await store.projects.findById(projectId, scope, clock.today());
      if (!row) return notFound("That project");
      return ok({ ...row, stages: await store.projects.listStages([row.id]), countsVisible: scope.kind !== "own" });
    },

    /** What the "new project" form needs: the client's live engagements and who can lead. */
    async newForm(
      actor: Actor,
      clientId: string,
    ): Promise<Result<{ clientId: string; clientName: string; leadStrategistId: string | null; engagements: Array<{ id: string; name: string; kind: string }>; people: Array<{ id: string; fullName: string }> }>> {
      if (!can(actor, "projects.write")) return forbidden("Only strategists and the owner start projects.");
      if (!isId(clientId)) return notFound("That client");
      const client = await store.clients.findById(clientId, clientScope(actor));
      if (!client) return notFound("That client");
      const [engagements, people] = await Promise.all([
        store.engagements.listForClients([client.id], { on: clock.today(), includeFees: false, includeBudgets: false, activeOnly: false }),
        store.people.listActive(),
      ]);
      return ok({
        clientId: client.id,
        clientName: client.name,
        leadStrategistId: client.leadStrategist?.id ?? null,
        engagements: engagements.filter((e) => e.status === "active" || e.status === "paused").map((e) => ({ id: e.id, name: e.name, kind: e.kind })),
        people: people.map((p) => ({ id: p.id, fullName: p.fullName })),
      });
    },

    /** Start a project for a client, usually from one of its engagements. */
    async create(actor: Actor, raw: unknown): Promise<Result<{ id: string; starterTasks: number }>> {
      if (!can(actor, "projects.write")) return forbidden("Only strategists and the owner start projects.");
      const parsed = parse(createProjectSchema, raw);
      if (!parsed.ok) return parsed;
      const input = parsed.value;
      return commit(store, async (repos) => {
        const client = await repos.clients.findById(input.clientId, clientScope(actor));
        if (!client) return notFound("That client");
        { const blocked = await levelBlocks(repos, actor, client.id, "edit"); if (blocked) return blocked; }
        let template = null;
        if (input.engagementId) {
          const [engagement] = (await repos.engagements.listForClients([client.id], { on: clock.today(), includeFees: false, includeBudgets: false, activeOnly: false })).filter(
            (e) => e.id === input.engagementId,
          );
          if (!engagement) return invalid("Pick one of this client's engagements.", { engagementId: ["Pick one of this client's engagements."] });
          template = await repos.projects.serviceTemplate(engagement.serviceId);
        }
        if (input.leadId) {
          const lead = await repos.people.findById(input.leadId);
          if (!lead || lead.status !== "active") return invalid("Pick someone on the team.", { leadId: ["Pick someone on the team."] });
        }

        const id = newId();
        const leadId = input.leadId ?? client.leadStrategist?.id ?? actor.personId;
        await repos.projects.create(id, {
          clientId: client.id,
          engagementId: input.engagementId,
          name: input.name,
          description: input.description,
          status: "active",
          leadId,
          startDate: input.startDate,
          dueDate: input.dueDate,
          createdById: actor.personId,
        });

        // Stages: the service's, copied, so later edits to the service don't rewrite this project (D20).
        const stageNames = template?.stages.length ? template.stages.map((s) => s.name) : ["To plan", "Doing", "Wrapping up"];
        const stages: StageRow[] = stageNames.map((name, position) => ({ id: newId(), projectId: id, name, position }));
        await repos.projects.createStages(stages);
        await repos.projects.update(id, { currentStageId: stages[0]!.id });

        const events: NewEvent[] = [];
        let starterTasks = 0;
        if (input.starterTasks && template?.tasks.length) {
          // Owners: someone on the client team with the template's role; otherwise the project lead.
          const team = await repos.people.listActive();
          const members = new Set((await repos.clients.listMembers(client.id)).map((m) => m.personId));
          const ownerFor = (role: string | null) => team.find((p) => members.has(p.id) && role && p.roles.includes(role as Role))?.id ?? leadId;
          const week = (await repos.calendar.getSetting<WorkWeek>("work_week")) ?? DEFAULT_WORK_WEEK;
          const ranks = generateNKeysBetween(null, null, template.tasks.length);
          const rows = template.tasks.map((t, i) => {
            const due = previousWorkingDay(addDays(input.startDate, t.dueOffsetDays), week) as IsoDate;
            return {
              id: newId(),
              projectId: id,
              clientId: client.id,
              parentTaskId: null,
              title: t.title,
              description: null,
              status: "todo" as const,
              priority: "normal" as const,
              ownerId: ownerFor(t.defaultRole),
              reviewerId: null,
              stageId: t.stagePosition !== null ? (stages[t.stagePosition]?.id ?? null) : null,
              deliverableId: null,
              startDate: null,
              dueDate: due < input.startDate ? input.startDate : due,
              estimateMinutes: t.estimateMinutes,
              completedAt: null,
              rank: ranks[i]!,
              recurrenceId: null,
              createdById: actor.personId,
            };
          });
          const inserted = await repos.tasks.createMany(rows);
          starterTasks = inserted.length;
          for (const r of rows) events.push({ actorId: actor.personId, action: "task.created", entityType: "task", entityId: r.id, clientId: client.id, data: { title: r.title, starter: true } });
        }
        return change(
          { id, starterTasks },
          { actorId: actor.personId, action: "project.created", entityType: "project", entityId: id, clientId: client.id, data: { name: input.name, starterTasks } },
          ...events,
        );
      });
    },

    async setStatus(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "projects.write")) return forbidden("Only strategists and the owner change projects.");
      const parsed = parse(projectStatusSchema, raw);
      if (!parsed.ok) return parsed;
      return commit(store, async (repos) => {
        const p = await repos.projects.findById(parsed.value.projectId, projectScope(actor), clock.today());
        if (!p) return notFound("That project");
        { const blocked = await levelBlocks(repos, actor, p.clientId, "edit"); if (blocked) return blocked; }
        if (p.status === parsed.value.status) return noChange({ id: p.id });
        await repos.projects.update(p.id, { status: parsed.value.status, completedAt: parsed.value.status === "completed" ? clock.now() : null });
        return change({ id: p.id }, { actorId: actor.personId, action: "project.status_changed", entityType: "project", entityId: p.id, clientId: p.clientId, data: { from: p.status, to: parsed.value.status } });
      });
    },

    async setStage(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "projects.write")) return forbidden("Only strategists and the owner change projects.");
      const parsed = parse(projectStageSchema, raw);
      if (!parsed.ok) return parsed;
      return commit(store, async (repos) => {
        const p = await repos.projects.findById(parsed.value.projectId, projectScope(actor), clock.today());
        if (!p) return notFound("That project");
        { const blocked = await levelBlocks(repos, actor, p.clientId, "edit"); if (blocked) return blocked; }
        const stage = (await repos.projects.listStages([p.id])).find((s) => s.id === parsed.value.stageId);
        if (!stage) return invalid("Pick a stage of this project.");
        await repos.projects.update(p.id, { currentStageId: stage.id });
        return change({ id: p.id }, { actorId: actor.personId, action: "project.stage_changed", entityType: "project", entityId: p.id, clientId: p.clientId, data: { from: p.currentStageName, to: stage.name } });
      });
    },
  };
}

export type ProjectService = ReturnType<typeof createProjectService>;
