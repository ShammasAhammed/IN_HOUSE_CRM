// Runs automation rules (Stage 9b.5) on the events a commit just recorded, in the same transaction, so a rule's work
// stands or falls with the change that set it off. One pass only: what rules do never sets off more rules (no loops).
// Every action checks its inputs first (an active person, a live task) and skips rather than fails, so a stale rule
// can never stop someone's own change from saving.
import { generateKeyBetween } from "fractional-indexing";
import { addDays, istDate } from "@/lib/dates";
import { newId } from "@/lib/id";
import type { TaskStatus } from "@/lib/types";
import type { AutomationRow, NewEvent, Repositories, TaskDetailRow } from "@/repositories";
import { toActor } from "./identity";
import { can, clientScope, type Actor } from "./permissions";
import { hiddenFor, spaceGuard } from "./spaces";
import { actionsSchema, conditionsSchema, happeningOf, ruleMatches, triggerSchema, type AutomationAction } from "./rules/automations";
import { countOf } from "@/lib/format";

/** Most rule runs one change can set off (a bulk change of 200 tasks with a rule each stays bounded). */
const MAX_RUNS = 200;

type Parsed = { row: AutomationRow; trigger: ReturnType<typeof triggerSchema.parse>; conditions: ReturnType<typeof conditionsSchema.parse>; actions: AutomationAction[] };

function parseRule(row: AutomationRow): Parsed | null {
  const t = triggerSchema.safeParse(row.trigger);
  const c = conditionsSchema.safeParse(row.conditions);
  const a = actionsSchema.safeParse(row.actions);
  return t.success && c.success && a.success ? { row, trigger: t.data, conditions: c.data, actions: a.data } : null;
}

export async function runAutomations(repos: Repositories, events: readonly NewEvent[], now: Date): Promise<NewEvent[]> {
  const happenings = events.filter((e) => !e.data?.automation).map(happeningOf).filter((h) => h !== null);
  if (!happenings.length) return [];
  const wanted = new Set(happenings.map((h) => h.trigger));
  const parsed = (await repos.taskSetup.automations({ activeOnly: true })).map(parseRule).filter((r): r is Parsed => r !== null && wanted.has(r.trigger.type));
  if (!parsed.length) return [];
  // A rule acts with its author's reach: when they leave, or lose the rule's client, the rule stops.
  const authors = new Map<string, Actor | null>();
  // A rule never reaches into a private space its author isn't in (Stage 14.1).
  const hiddenOf = new Map<string, ReadonlySet<string>>();
  const rules: Parsed[] = [];
  for (const r of parsed) {
    const authorId = r.row.createdById;
    if (!authorId) continue;
    if (!authors.has(authorId)) {
      const p = await repos.people.findById(authorId);
      authors.set(authorId, p && p.status === "active" ? toActor(p) : null);
    }
    const author = authors.get(authorId);
    if (!author || !can(author, "projects.write")) continue;
    if (clientScope(author).kind !== "all" && !(r.conditions.clientId && (await repos.clients.findById(r.conditions.clientId, clientScope(author))))) continue;
    if (!hiddenOf.has(authorId)) hiddenOf.set(authorId, await hiddenFor(repos, author));
    rules.push(r);
  }
  if (!rules.length) return [];
  const today = istDate(now);
  const out: NewEvent[] = [];
  let runs = 0;
  for (const h of happenings) {
    const candidates = rules.filter((r) => r.trigger.type === h.trigger);
    if (!candidates.length) continue;
    const task = await repos.tasks.findById(h.taskId, { kind: "all" });
    if (!task) continue;
    for (const rule of candidates) {
      if (runs >= MAX_RUNS) return out;
      if (!ruleMatches(rule, h, task)) continue;
      if (hiddenOf.get(rule.row.createdById!)?.has(task.clientId)) continue;
      runs++;
      const did: string[] = [];
      for (const action of rule.actions) {
        const fresh = await repos.tasks.findById(task.id, { kind: "all" });
        if (!fresh) break;
        const r = await apply(repos, fresh, action, { ruleId: rule.row.id, ruleName: rule.row.name, today, now });
        if (r) {
          did.push(r.summary);
          out.push(...r.events);
        }
      }
      if (did.length) {
        await repos.taskSetup.countRun(rule.row.id, now);
        out.push({ actorId: null, action: "automation.ran", entityType: "automation", entityId: rule.row.id, clientId: task.clientId, data: { automation: rule.row.id, taskId: task.id, did } });
      }
    }
  }
  return out;
}

async function activePerson(repos: Repositories, id: string) {
  const p = await repos.people.findById(id);
  return p && p.status === "active" ? p : null;
}

async function apply(
  repos: Repositories,
  t: TaskDetailRow,
  a: AutomationAction,
  ctx: { ruleId: string; ruleName: string; today: string; now: Date },
): Promise<{ summary: string; events: NewEvent[] } | null> {
  const ev = (action: string, data: Record<string, unknown>): NewEvent => ({
    actorId: null,
    action,
    entityType: "task",
    entityId: t.id,
    clientId: t.clientId,
    data: { ...data, title: t.title, automation: ctx.ruleId, rule: ctx.ruleName },
  });
  switch (a.type) {
    case "set_status": {
      if (t.status === a.status) return null;
      const done = a.status === "done";
      const rank = t.parentTaskId ? t.rank : generateKeyBetween(await repos.tasks.lastRank(t.projectId, a.status as TaskStatus), null);
      await repos.tasks.update(t.id, { status: a.status, completedAt: done ? (t.completedAt ?? ctx.now) : null, rank });
      return { summary: `status ${a.status}`, events: [ev(done ? "task.completed" : t.status === "done" ? "task.reopened" : "task.status_changed", { from: t.status, to: a.status })] };
    }
    case "set_priority":
      if (t.priority === a.priority) return null;
      await repos.tasks.update(t.id, { priority: a.priority });
      return { summary: `priority ${a.priority}`, events: [ev("task.updated", { fields: ["priority"], values: { priority: [t.priority, a.priority] } })] };
    case "assign": {
      if (t.ownerId === a.personId || !(await activePerson(repos, a.personId)) || (await spaceGuard(repos)(a.personId, t.clientId))) return null;
      await repos.tasks.update(t.id, { ownerId: a.personId });
      return { summary: "assigned", events: [ev("task.reassigned", { from: t.ownerId, to: a.personId })] };
    }
    case "add_tag": {
      const tags = t.tags ?? [];
      if (tags.some((x) => x.toLowerCase() === a.tag.toLowerCase()) || tags.length >= 10) return null;
      await repos.tasks.update(t.id, { tags: [...tags, a.tag] });
      return { summary: `tag ${a.tag}`, events: [ev("task.tagged", { tags: [...tags, a.tag] })] };
    }
    case "add_watcher": {
      if (!(await activePerson(repos, a.personId)) || (await spaceGuard(repos)(a.personId, t.clientId))) return null;
      if ((await repos.tasks.people(t.id)).some((p) => p.personId === a.personId && p.role === "watcher")) return null;
      await repos.tasks.addPerson({ id: newId(), taskId: t.id, personId: a.personId, role: "watcher", addedById: a.personId });
      return { summary: "watcher added", events: [ev("task.person_added", { personId: a.personId, role: "watcher" })] };
    }
    case "add_checklist": {
      const items = await repos.tasks.checklist(t.id);
      let rank = items.at(-1)?.rank ?? null;
      const add = a.steps.filter((s) => !items.some((i) => i.text === s)).slice(0, Math.max(0, 100 - items.length));
      if (!add.length) return null;
      for (const text of add) {
        rank = generateKeyBetween(rank, null);
        await repos.tasks.addChecklistItem({ id: newId(), taskId: t.id, text, rank, createdById: t.createdById ?? t.ownerId ?? null });
      }
      return { summary: countOf(add.length, "step"), events: [ev("task.checklist_added", { steps: add })] };
    }
    case "notify": {
      if (!(await activePerson(repos, a.personId)) || (await spaceGuard(repos)(a.personId, t.clientId))) return null;
      await repos.notifications.create([{ id: newId(), personId: a.personId, kind: "automation", title: a.message, body: `${t.title} · ${t.clientName}`, link: `/tasks/${t.id}`, entityType: "task", entityId: t.id }]);
      return { summary: "notified", events: [ev("task.automation_notified", { personId: a.personId })] };
    }
    case "set_due": {
      const due = addDays(ctx.today, a.days);
      if (t.dueDate === due) return null;
      await repos.tasks.update(t.id, { dueDate: due, ...(t.startDate && t.startDate > due ? { startDate: due } : {}) });
      return { summary: `due ${due}`, events: [ev("task.updated", { fields: ["dueDate"], values: { dueDate: [t.dueDate, due] } })] };
    }
    case "create_task": {
      const owner = a.ownerId && !(await spaceGuard(repos)(a.ownerId, t.clientId)) ? await activePerson(repos, a.ownerId) : null;
      const id = newId();
      await repos.tasks.create(id, {
        projectId: t.projectId,
        clientId: t.clientId,
        parentTaskId: null,
        title: a.title,
        description: `Created by the automation "${ctx.ruleName}" after: ${t.title}`,
        status: "todo",
        priority: "normal",
        ownerId: owner?.id ?? t.ownerId,
        reviewerId: null,
        stageId: null,
        deliverableId: null,
        startDate: null,
        dueDate: a.days === null ? null : addDays(ctx.today, a.days),
        estimateMinutes: null,
        completedAt: null,
        rank: generateKeyBetween(await repos.tasks.lastRank(t.projectId, "todo"), null),
        recurrenceId: null,
        createdById: null,
      });
      return {
        summary: "follow-up created",
        events: [{ actorId: null, action: "task.created", entityType: "task", entityId: id, clientId: t.clientId, data: { title: a.title, ownerId: owner?.id ?? t.ownerId, automation: ctx.ruleId, after: t.id } }],
      };
    }
  }
}
