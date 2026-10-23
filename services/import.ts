// The ClickUp import (D38): preview what an export holds and suggest a mapping, then create clients, projects and
// open tasks in one go. Owner only. Importing the same export again adds nothing twice (tasks keep their ClickUp id).

import { generateNKeysBetween } from "fractional-indexing";
import { newId } from "@/lib/id";
import { forbidden, invalid, ok, type Result } from "@/lib/result";
import type { TaskStatus } from "@/lib/types";
import { parse } from "@/lib/validation/common";
import { importMappingSchema, importTasksSchema, type ImportMapping, type ImportedTask } from "@/lib/validation/import";
import type { DataStore, NewEvent, TaskWrite } from "@/repositories";
import { change, commit, noChange } from "./change";
import type { Clock } from "./clock";
import { can, type Actor } from "./permissions";
import { planImport, suggestPerson, suggestStatus, type PlannedTask } from "./rules/import";

type Level = "space" | "folder" | "list";
const LEVELS: Level[] = ["space", "folder", "list"];
const DENIED = "Only the owner imports from ClickUp.";
/** Projects made by the import get simple stages; the team can change their stage as work moves. */
const IMPORT_STAGES = ["To plan", "Doing", "Wrapping up"];
const ref = (r: string) => `clickup:${r}`;

export type ImportPreview = {
  tasks: number;
  /** Already imported earlier (same ClickUp id). */
  alreadyImported: number;
  /** Which levels have values, and the clients each would give, with a suggestion for each. */
  levels: Record<Level, { filled: number; clients: Array<{ name: string; tasks: number; suggestion: string; existingName: string | null }> }>;
  statuses: Array<{ name: string; tasks: number; suggestion: TaskStatus | "skip" }>;
  people: Array<{ name: string; tasks: number; suggestion: string }>;
  defaults: { clientFrom: Level; projectFrom: Level | "none" };
  options: { clients: Array<{ id: string; name: string }>; people: Array<{ id: string; fullName: string }> };
};

export type ImportResult = { clients: number; projects: number; tasks: number; subtasks: number; alreadyImported: number; closed: number; leftOut: number };

const countBy = <T>(items: T[], key: (t: T) => string | null) => {
  const m = new Map<string, number>();
  for (const i of items) {
    const k = key(i);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
};

export function createImportService(deps: { store: DataStore; clock: Clock }) {
  const { store } = deps;

  return {
    async preview(actor: Actor, raw: unknown): Promise<Result<ImportPreview>> {
      if (!can(actor, "settings.manage")) return forbidden(DENIED);
      const parsed = parse(importTasksSchema, raw);
      if (!parsed.ok) return parsed;
      const tasks = parsed.value;
      const [clients, people, existing] = await Promise.all([
        store.clients.list({ kind: "all" }),
        store.people.listActive(),
        store.tasks.findExternal(tasks.map((t) => ref(t.ref))),
      ]);
      const byName = new Map(clients.map((c) => [c.name.toLowerCase(), c]));
      const levels = Object.fromEntries(
        LEVELS.map((level) => [
          level,
          {
            filled: tasks.filter((t) => t[level]).length,
            clients: countBy(tasks, (t) => t[level]).map(([name, n]) => {
              const match = byName.get(name.toLowerCase());
              return { name, tasks: n, suggestion: match?.id ?? "new", existingName: match?.name ?? null };
            }),
          },
        ]),
      ) as ImportPreview["levels"];
      // Folders usually hold one client each; fall back to spaces, then lists.
      const clientFrom: Level = levels.folder.filled >= tasks.length * 0.8 ? "folder" : levels.space.clients.length > 1 ? "space" : "list";
      return ok({
        tasks: tasks.length,
        alreadyImported: existing.length,
        levels,
        statuses: countBy(tasks, (t) => t.status || "(no status)").map(([name, n]) => ({ name, tasks: n, suggestion: suggestStatus(name) })),
        people: countBy(tasks.flatMap((t) => t.assignees), (a) => a).map(([name, n]) => ({ name, tasks: n, suggestion: suggestPerson(name, people) })),
        defaults: { clientFrom, projectFrom: clientFrom === "list" ? "none" : "list" },
        options: { clients: clients.map((c) => ({ id: c.id, name: c.name })), people: people.map((p) => ({ id: p.id, fullName: p.fullName })) },
      });
    },

    async run(actor: Actor, raw: { tasks: unknown; mapping: unknown }): Promise<Result<ImportResult>> {
      if (!can(actor, "settings.manage")) return forbidden(DENIED);
      const parsedTasks = parse(importTasksSchema, raw.tasks);
      if (!parsedTasks.ok) return parsedTasks;
      const parsedMapping = parse(importMappingSchema, raw.mapping);
      if (!parsedMapping.ok) return parsedMapping;
      // A status with no explicit choice uses the suggestion, so "(no status)" maps too.
      const tasks: ImportedTask[] = parsedTasks.value.map((t) => ({ ...t, status: t.status || "(no status)" }));
      const mapping: ImportMapping = parsedMapping.value;
      const plan = planImport(tasks, mapping);
      const imported = { source: "clickup" };

      return commit(store, async (repos) => {
        // One import at a time per person: a double-click waits for the first, then finds everything already there.
        await repos.people.lockForUpdate(actor.personId);
        const events: NewEvent[] = [];
        const people = new Set((await repos.people.listActive()).map((p) => p.id));
        for (const id of Object.values(mapping.people)) if (id && !people.has(id)) return invalid("One of the people picked has left. Pick again.");

        // Already imported: kept as they are, but they can still be parents for new subtasks.
        const lookups = [...new Set([...plan.tasks.map((t) => ref(t.ref)), ...plan.tasks.flatMap((t) => (t.parentRef ? [ref(t.parentRef)] : []))])];
        const existing = new Map((await repos.tasks.findExternal(lookups)).map((e) => [e.externalId, e]));
        const fresh = plan.tasks.filter((t) => !existing.has(ref(t.ref)));
        const byRef = new Map(plan.tasks.map((t) => [t.ref, t]));

        // Where each new task goes (one level of subtasks, always in the parent's project and client):
        // top level in its own project; under a task made earlier; or under a task made in this import.
        type Placement = { kind: "top" } | { kind: "under_existing"; parentId: string; projectId: string; clientId: string } | { kind: "under_new"; parentRef: string };
        const place = (t: PlannedTask, depth = 0): Placement => {
          if (!t.parentRef || depth > 5) return { kind: "top" };
          const e = existing.get(ref(t.parentRef));
          if (e) return { kind: "under_existing", parentId: e.parentTaskId ?? e.id, projectId: e.projectId, clientId: e.clientId };
          const parent = byRef.get(t.parentRef);
          if (!parent) return { kind: "top" };
          const up = place(parent, depth + 1);
          return up.kind === "top" ? { kind: "under_new", parentRef: parent.ref } : up;
        };
        const placed = fresh.map((t) => ({ t, at: place(t) }));
        // Tasks that need their planned client and project: top-level ones, and subtasks of new top-level ones.
        const ownHome = placed.filter((x) => x.at.kind !== "under_existing").map((x) => x.t);

        // Clients: chosen, matched by name, or new.
        const clientIds = new Map<string, string>();
        let clientsMade = 0;
        for (const c of plan.clients) {
          if (!ownHome.some((t) => t.clientKey === c.key)) continue;
          if (c.existingId) {
            const found = await repos.clients.findById(c.existingId, { kind: "all" });
            if (!found) return invalid(`The client picked for ${c.key} wasn't found.`);
            clientIds.set(c.key, found.id);
            continue;
          }
          const same = await repos.clients.findByName(c.key);
          if (same) {
            clientIds.set(c.key, same.id);
            continue;
          }
          const id = newId();
          await repos.clients.create(id, { name: c.key.slice(0, 120), legalName: null, segment: "other", city: null, status: "active", startDate: null, gstin: null, billingAddress: null, crmLeadId: null, leadStrategistId: null, notes: "Imported from ClickUp.", driveFolderUrl: null });
          clientIds.set(c.key, id);
          clientsMade++;
          events.push({ actorId: actor.personId, action: "client.created", entityType: "client", entityId: id, clientId: id, data: { name: c.key, imported } });
        }

        // Projects: an existing one of the same name, or a new one.
        const projectIds = new Map<string, string>();
        let projectsMade = 0;
        const today = deps.clock.today();
        for (const p of plan.projects) {
          const clientId = clientIds.get(p.clientKey);
          if (!clientId || !ownHome.some((t) => t.clientKey === p.clientKey && t.projectName === p.name)) continue;
          const key = `${p.clientKey}\u0000${p.name}`;
          const same = (await repos.projects.list({ clientIds: [clientId], scope: { kind: "all" }, today })).find((x) => x.name.toLowerCase() === p.name.toLowerCase());
          if (same) {
            projectIds.set(key, same.id);
            continue;
          }
          const client = await repos.clients.findById(clientId, { kind: "all" });
          const id = newId();
          await repos.projects.create(id, { clientId, engagementId: null, name: p.name.slice(0, 120), description: null, status: "active", leadId: client?.leadStrategist?.id ?? actor.personId, startDate: today, dueDate: null, createdById: actor.personId });
          const stages = IMPORT_STAGES.map((name, position) => ({ id: newId(), projectId: id, name, position }));
          await repos.projects.createStages(stages);
          await repos.projects.update(id, { currentStageId: stages[0]!.id });
          projectIds.set(key, id);
          projectsMade++;
          events.push({ actorId: actor.personId, action: "project.created", entityType: "project", entityId: id, clientId, data: { name: p.name, imported } });
        }

        // Rows, in two passes: top-level first, so new subtasks can point at them.
        const newIds = new Map<string, string>();
        const homeOf = (t: PlannedTask) => ({ projectId: projectIds.get(`${t.clientKey}\u0000${t.projectName}`)!, clientId: clientIds.get(t.clientKey)! });
        const rowFor = (t: PlannedTask, home: { projectId: string; clientId: string }, parentTaskId: string | null): TaskWrite & { id: string } => {
          const row = {
            id: newId(),
            ...home,
            parentTaskId,
            title: t.title,
            description: t.description,
            status: t.status,
            priority: t.priority,
            ownerId: t.ownerId,
            reviewerId: null,
            stageId: null,
            deliverableId: null,
            startDate: t.startDate,
            dueDate: t.dueDate,
            estimateMinutes: t.estimateMinutes,
            completedAt: null,
            rank: "",
            recurrenceId: null,
            createdById: actor.personId,
            externalId: ref(t.ref),
          };
          newIds.set(t.ref, row.id);
          return row;
        };
        const insert = async (rows: Array<TaskWrite & { id: string }>) => {
          const groups = new Map<string, Array<TaskWrite & { id: string }>>();
          for (const r of rows) {
            const g = `${r.projectId}\u0000${r.parentTaskId ? "sub" : r.status}`;
            groups.set(g, [...(groups.get(g) ?? []), r]);
          }
          for (const [g, list] of groups) {
            const [projectId, status] = g.split("\u0000") as [string, string];
            const last = status === "sub" ? null : await repos.tasks.lastRank(projectId, status as TaskStatus);
            generateNKeysBetween(last, null, list.length).forEach((rank, i) => (list[i]!.rank = rank));
            await repos.tasks.createMany(list);
            for (const r of list) events.push({ actorId: actor.personId, action: "task.created", entityType: "task", entityId: r.id, clientId: r.clientId, data: { title: r.title, imported } });
          }
        };
        const top = placed.filter((x) => x.at.kind === "top");
        await insert(top.map(({ t }) => rowFor(t, homeOf(t), null)));
        const subs = placed.filter((x) => x.at.kind !== "top");
        await insert(
          subs.map(({ t, at }) => {
            if (at.kind === "under_existing") return rowFor(t, { projectId: at.projectId, clientId: at.clientId }, at.parentId);
            const parent = byRef.get((at as { parentRef: string }).parentRef)!;
            return rowFor(t, homeOf(parent), newIds.get(parent.ref)!);
          }),
        );

        // Owners join the team of the client their task ended up in, so its projects show for them (D13).
        const owners = new Map<string, Set<string>>();
        for (const ev of events.filter((e) => e.action === "task.created")) {
          const owner = fresh.find((t) => newIds.get(t.ref) === ev.entityId)?.ownerId;
          if (owner && ev.clientId) owners.set(ev.clientId, (owners.get(ev.clientId) ?? new Set()).add(owner));
        }
        for (const [clientId, ids] of owners) {
          const team = new Set((await repos.clients.listMembers(clientId)).map((m) => m.personId));
          for (const ownerId of ids) {
            if (team.has(ownerId)) continue;
            await repos.clients.addMember(clientId, ownerId);
            events.push({ actorId: actor.personId, action: "client.member_added", entityType: "client", entityId: clientId, clientId, data: { personId: ownerId, imported } });
          }
        }

        const result: ImportResult = {
          clients: clientsMade,
          projects: projectsMade,
          tasks: top.length,
          subtasks: subs.length,
          alreadyImported: plan.tasks.length - fresh.length,
          closed: plan.skipped.closed,
          leftOut: plan.skipped.clientLeftOut + plan.skipped.noClient,
        };
        // Everything was already there: nothing to record.
        return events.length ? change(result, ...(events as [NewEvent, ...NewEvent[]])) : noChange(result);
      });
    },
  };
}

export type ImportService = ReturnType<typeof createImportService>;
