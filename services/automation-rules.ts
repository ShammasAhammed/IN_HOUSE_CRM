// Managing automation rules (Stage 9b.5): strategists and the owner. A rule for every client needs someone who sees
// every client (the owner); others limit their rules to a client or project of theirs.
import { z } from "zod";
import { isId, newId } from "@/lib/id";
import { forbidden, invalid, notFound, ok, type Result } from "@/lib/result";
import { optionalId, parse } from "@/lib/validation/common";
import type { AutomationRow, DataStore } from "@/repositories";
import { change, commit } from "./change";
import type { Clock } from "./clock";
import { can, clientScope, type Actor } from "./permissions";
import { hiddenFor } from "./spaces";
import { actionsSchema, conditionsSchema, triggerSchema, type AutomationAction, type AutomationConditions, type AutomationTrigger } from "./rules/automations";
import { taskScope } from "./tasks";

const LEADS_ONLY = "Only strategists and the owner set up automations.";
const json = z.string().transform((v, ctx) => {
  try {
    return JSON.parse(v) as unknown;
  } catch {
    ctx.addIssue({ code: "custom", message: "That rule couldn't be read." });
    return z.NEVER;
  }
});
const saveSchema = z.object({
  automationId: optionalId,
  name: z.string().trim().min(2, { message: "Name the automation." }).max(80),
  active: z.union([z.literal("on"), z.literal(""), z.boolean()]).optional().transform((v) => v === "on" || v === true),
  trigger: json,
  conditions: json,
  actions: json,
});

export type AutomationView = Omit<AutomationRow, "trigger" | "conditions" | "actions"> & { trigger: AutomationTrigger; conditions: AutomationConditions; actions: AutomationAction[]; canEdit: boolean };

export function createAutomationRuleService(deps: { store: DataStore; clock: Clock }) {
  const { store, clock } = deps;
  const lead = (actor: Actor) => can(actor, "projects.write");
  const everywhere = (actor: Actor) => clientScope(actor).kind === "all";

  async function visible(actor: Actor): Promise<Set<string> | "all"> {
    if (everywhere(actor)) return "all";
    return new Set((await store.clients.list(clientScope(actor))).map((c) => c.id));
  }

  return {
    /** Rules this person may see: all for the owner; for others, the ones about their clients. */
    async list(actor: Actor): Promise<Result<{ rules: AutomationView[]; canManage: boolean }>> {
      if (!lead(actor)) return forbidden(LEADS_ONLY);
      const [seen, hidden] = await Promise.all([visible(actor), hiddenFor(store, actor)]);
      const projects = await store.projects.list({ scope: taskScope(actor), today: clock.today() });
      const projectClient = new Map(projects.map((p) => [p.id, p.clientId]));
      const rules: AutomationView[] = [];
      for (const row of await store.taskSetup.automations()) {
        const t = triggerSchema.safeParse(row.trigger);
        const c = conditionsSchema.safeParse(row.conditions);
        const a = actionsSchema.safeParse(row.actions);
        if (!t.success || !c.success || !a.success) continue;
        const clientId = c.data.clientId ?? (c.data.projectId ? projectClient.get(c.data.projectId) : undefined);
        const mine = (seen === "all" || (clientId !== undefined && seen.has(clientId))) && !(clientId && hidden.has(clientId));
        if (!mine) continue;
        rules.push({ ...row, trigger: t.data, conditions: c.data, actions: a.data, canEdit: seen === "all" || row.createdById === actor.personId || clientId !== undefined });
      }
      return ok({ rules, canManage: true });
    },

    async save(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!lead(actor)) return forbidden(LEADS_ONLY);
      const parsed = parse(saveSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      const trigger = triggerSchema.safeParse(v.trigger);
      const conditions = conditionsSchema.safeParse(v.conditions);
      const actions = actionsSchema.safeParse(v.actions);
      if (!trigger.success) return invalid("Pick when it runs.");
      if (!conditions.success) return invalid("Check the conditions.");
      if (!actions.success) return invalid(actions.error.issues[0]?.message === "Add at least one action." ? "Add at least one action." : "Check the actions: each needs its details filled in.");
      return commit(store, async (repos) => {
        const c = conditions.data;
        let clientId = c.clientId;
        if (c.projectId) {
          const project = await repos.projects.findById(c.projectId, taskScope(actor), clock.today());
          if (!project) return invalid("Pick one of your projects.");
          if (clientId && clientId !== project.clientId) return invalid("That project isn't for that client.");
          clientId = project.clientId;
        }
        if (clientId && !(await repos.clients.findById(clientId, clientScope(actor)))) return invalid("Pick one of your clients.");
        if (!clientId && !everywhere(actor)) return invalid("Pick a client or project for this rule. Only the owner sets rules for every client.");
        for (const a of actions.data) {
          const personId = a.type === "assign" || a.type === "add_watcher" || a.type === "notify" ? a.personId : a.type === "create_task" ? a.ownerId : null;
          if (personId) {
            const p = await repos.people.findById(personId);
            if (!p || p.status !== "active") return invalid("Pick someone on the team for each action.");
          }
        }
        const before = v.automationId ? await repos.taskSetup.findAutomation(v.automationId) : null;
        if (v.automationId && !before) return notFound("That automation");
        // Changing a rule needs the same reach as making it: its current client must be one of yours too.
        if (before) {
          const was = conditionsSchema.safeParse(before.conditions);
          const wasClient = was.success ? (was.data.clientId ?? (was.data.projectId ? (await repos.projects.findById(was.data.projectId, { kind: "all" }, clock.today()))?.clientId : undefined)) : undefined;
          // Whoever sees everything still can't reach a rule in a private space they aren't in (Stage 14.1).
          if (wasClient ? !(await repos.clients.findById(wasClient, clientScope(actor))) : !everywhere(actor)) return notFound("That automation");
        }
        // The client is stored with the rule, so who may see, change and run it never depends on a later lookup.
        const row = { name: v.name, active: v.active, trigger: trigger.data, conditions: { ...c, ...(clientId ? { clientId } : {}) }, actions: actions.data as Array<Record<string, unknown>> };
        const id = before?.id ?? newId();
        if (before) await repos.taskSetup.updateAutomation(id, row);
        else await repos.taskSetup.addAutomation({ ...row, id, createdById: actor.personId });
        return change({ id }, { actorId: actor.personId, action: before ? "automation.changed" : "automation.created", entityType: "automation", entityId: id, clientId: clientId ?? null, data: { name: v.name, active: v.active, trigger: trigger.data.type } });
      });
    },

    async remove(actor: Actor, automationId: string): Promise<Result<null>> {
      if (!lead(actor)) return forbidden(LEADS_ONLY);
      if (!isId(automationId)) return notFound("That automation");
      return commit(store, async (repos) => {
        const a = await repos.taskSetup.findAutomation(automationId);
        if (!a) return notFound("That automation");
        const c = conditionsSchema.safeParse(a.conditions);
        const clientId = c.success ? (c.data.clientId ?? (c.data.projectId ? (await repos.projects.findById(c.data.projectId, { kind: "all" }, clock.today()))?.clientId : undefined)) : undefined;
        if (clientId ? !(await repos.clients.findById(clientId, clientScope(actor))) : !everywhere(actor)) return forbidden("That automation belongs to another team's client.");
        await repos.taskSetup.updateAutomation(a.id, { deletedAt: clock.now(), active: false });
        return change(null, { actorId: actor.personId, action: "automation.removed", entityType: "automation", entityId: a.id, data: { name: a.name } });
      });
    },
  };
}

export type AutomationRuleService = ReturnType<typeof createAutomationRuleService>;
