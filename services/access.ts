// The access register and joining/exit checklists (plan/4-hr-module.md, "Joining and leaving"; D77).
// HR and the owner keep them (access.manage); a person sees their own access and checklists.
// Exit → security: the exit checklist lists every open access, and ticking one off revokes it in the register.

import { isId, newId, settingId } from "@/lib/id";
import { conflict, forbidden, invalid, notFound, ok, type Result } from "@/lib/result";
import type { ChecklistKind } from "@/lib/types";
import {
  addChecklistItemSchema,
  checklistDoneSchema,
  checklistItemSchema,
  checklistTemplateSchema,
  grantAccessSchema,
  revokeAccessSchema,
  startChecklistSchema,
} from "@/lib/validation/access";
import { parse } from "@/lib/validation/common";
import type { AccessGrantRecord, ChecklistItemRecord, DataStore, NewEvent, Repositories } from "@/repositories";
import { change, commit, noChange } from "./change";
import type { Clock } from "./clock";
import { can, type Actor } from "./permissions";
import { cleanTemplate, DEFAULT_EXIT, DEFAULT_JOINING, exitItems } from "./rules/checklists";

export type PersonAccess = {
  /** Still working here: leavers get no new access or checklists. */
  active: boolean;
  access: AccessGrantRecord[];
  checklists: Record<ChecklistKind, ChecklistItemRecord[]>;
  canManage: boolean;
  /** Clients to pick from for a client account (managers only). */
  clients?: Array<{ id: string; name: string }>;
};

const DENIED = "Only HR and the owner keep the access register and checklists.";
const TEMPLATE_KEY: Record<ChecklistKind, string> = { joining: "joining_checklist", exit: "exit_checklist" };

/** The template HR set, or the default. */
export async function checklistTemplate(repos: Repositories, kind: ChecklistKind): Promise<string[]> {
  return (await repos.calendar.getSetting<string[]>(TEMPLATE_KEY[kind])) ?? (kind === "joining" ? DEFAULT_JOINING : DEFAULT_EXIT);
}

/**
 * Create a person's checklist inside an open transaction (used when someone joins or leaves). Nothing happens when they
 * already have one of that kind. Returns the events to record.
 */
export async function startChecklistIn(repos: Repositories, input: { personId: string; kind: ChecklistKind; actorId: string }): Promise<NewEvent[]> {
  if ((await repos.access.listItems(input.personId)).some((i) => i.kind === input.kind)) return [];
  const template = await checklistTemplate(repos, input.kind);
  const items =
    input.kind === "joining"
      ? template.map((title) => ({ title, source: null }))
      : exitItems(template, {
          accesses: (await repos.access.listGrants(input.personId)).filter((g) => !g.revokedOn),
          clients: await repos.clients.listTeamsOf(input.personId),
          openTasks: (await repos.tasks.list({ scope: { kind: "own", personId: input.personId }, ownerId: input.personId, statuses: ["todo", "in_progress", "in_review", "blocked"], anyLevel: true })).length,
        });
  await repos.access.createItems(items.map((it, position) => ({ id: newId(), personId: input.personId, kind: input.kind, title: it.title, position, source: it.source })));
  return [{ actorId: input.actorId, action: "checklist.started", entityType: "person", entityId: input.personId, personId: input.personId, data: { kind: input.kind, items: items.length } }];
}

export function createAccessService(deps: { store: DataStore; clock: Clock }) {
  const { store, clock } = deps;

  const event = (actor: Actor, personId: string, entity: { type: "access_grant" | "checklist_item"; id: string }, action: string, data: Record<string, unknown>): NewEvent => ({
    actorId: actor.personId,
    action,
    entityType: entity.type,
    entityId: entity.id,
    personId,
    data,
  });

  async function revoke(repos: Repositories, actor: Actor, grant: AccessGrantRecord, on: string): Promise<NewEvent> {
    await repos.access.updateGrant(grant.id, { revokedOn: on, revokedById: actor.personId });
    return event(actor, grant.personId, { type: "access_grant", id: grant.id }, "access.revoked", { system: grant.system, account: grant.account, on });
  }

  return {
    /** A person's access and checklists: their own, or anyone's for HR and the owner. */
    async forPerson(actor: Actor, personId: string): Promise<Result<PersonAccess>> {
      const canManage = can(actor, "access.manage");
      if (personId !== actor.personId && !canManage) return forbidden(DENIED);
      if (!isId(personId)) return notFound("That person");
      const [person, access, items, clients] = await Promise.all([
        store.people.findById(personId),
        store.access.listGrants(personId),
        store.access.listItems(personId),
        canManage ? store.clients.list({ kind: "all" }) : Promise.resolve([]),
      ]);
      if (!person) return notFound("That person");
      return ok({
        active: person.status === "active",
        access,
        checklists: { joining: items.filter((i) => i.kind === "joining"), exit: items.filter((i) => i.kind === "exit") },
        canManage,
        ...(canManage ? { clients: clients.map((c) => ({ id: c.id, name: c.name })) } : {}),
      });
    },

    async grant(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "access.manage")) return forbidden(DENIED);
      const parsed = parse(grantAccessSchema, raw);
      if (!parsed.ok) return parsed;
      const input = parsed.value;
      if (input.grantedOn > clock.today()) return invalid("That day hasn't come yet.", { grantedOn: ["Pick today or an earlier day."] });
      return commit(store, async (repos) => {
        // Locked like recording an exit, so a grant made at that moment still lands on the exit checklist.
        const person = await repos.people.lockForUpdate(input.personId);
        if (!person) return notFound("That person");
        if (input.clientId && !(await repos.clients.findById(input.clientId, { kind: "all" }))) return invalid("Pick a client.", { clientId: ["Pick a client."] });
        const id = newId();
        await repos.access.createGrant(id, { ...input, grantedById: actor.personId });
        // Someone already leaving: the new access goes straight onto their exit checklist.
        const items = await repos.access.listItems(person.id);
        const exit = items.filter((i) => i.kind === "exit");
        const events: NewEvent[] = [];
        if (exit.length) {
          const itemId = newId();
          await repos.access.createItems([
            { id: itemId, personId: person.id, kind: "exit", title: `Remove access: ${input.system}${input.account ? ` — ${input.account}` : ""}${input.level ? ` (${input.level})` : ""}`, position: Math.max(...exit.map((i) => i.position)) + 1, source: `access:${id}` },
          ]);
          events.push(event(actor, person.id, { type: "checklist_item", id: itemId }, "checklist.item_added", { kind: "exit" }));
        }
        return change({ id }, event(actor, person.id, { type: "access_grant", id }, "access.granted", { system: input.system, account: input.account, level: input.level }), ...events);
      });
    },

    async revoke(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "access.manage")) return forbidden(DENIED);
      const parsed = parse(revokeAccessSchema, raw);
      if (!parsed.ok) return parsed;
      const on = parsed.value.revokedOn ?? clock.today();
      if (on > clock.today()) return invalid("That day hasn't come yet.");
      return commit(store, async (repos) => {
        const g = await repos.access.findGrant(parsed.value.grantId);
        if (!g) return notFound("That access");
        if (g.revokedOn) return conflict(`Already removed on ${g.revokedOn}.`);
        if (on < g.grantedOn) return invalid("That's before it was given.");
        const events = [await revoke(repos, actor, g, on)];
        // Its exit checklist item, if any, is done too.
        const item = (await repos.access.listItems(g.personId)).find((i) => i.source === `access:${g.id}` && !i.doneAt);
        if (item) {
          await repos.access.updateItem(item.id, { doneAt: clock.now(), doneById: actor.personId });
          events.push(event(actor, g.personId, { type: "checklist_item", id: item.id }, "checklist.item_done", { title: item.title }));
        }
        return change({ id: g.id }, ...(events as [NewEvent, ...NewEvent[]]));
      });
    },

    async startChecklist(actor: Actor, raw: unknown): Promise<Result<{ items: number }>> {
      if (!can(actor, "access.manage")) return forbidden(DENIED);
      const parsed = parse(startChecklistSchema, raw);
      if (!parsed.ok) return parsed;
      return commit(store, async (repos) => {
        const person = await repos.people.lockForUpdate(parsed.value.personId);
        if (!person) return notFound("That person");
        const events = await startChecklistIn(repos, { ...parsed.value, actorId: actor.personId });
        if (events.length === 0) return conflict("They already have that checklist.");
        return change({ items: (events[0]!.data as { items: number }).items }, ...(events as [NewEvent, ...NewEvent[]]));
      });
    },

    /** Tick a step (or untick it). An exit step for an access revokes it — or restores it when unticked by mistake. */
    async setDone(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "access.manage")) return forbidden(DENIED);
      const parsed = parse(checklistDoneSchema, raw);
      if (!parsed.ok) return parsed;
      return commit(store, async (repos) => {
        const item = await repos.access.findItem(parsed.value.itemId);
        if (!item) return notFound("That step");
        if (Boolean(item.doneAt) === parsed.value.done) return noChange({ id: item.id });
        await repos.access.updateItem(item.id, parsed.value.done ? { doneAt: clock.now(), doneById: actor.personId } : { doneAt: null, doneById: null });
        const events: NewEvent[] = [event(actor, item.personId, { type: "checklist_item", id: item.id }, parsed.value.done ? "checklist.item_done" : "checklist.item_undone", { title: item.title, kind: item.kind })];
        const grantId = item.source?.startsWith("access:") ? item.source.slice(7) : null;
        const grant = grantId ? await repos.access.findGrant(grantId) : null;
        if (grant && parsed.value.done && !grant.revokedOn) events.push(await revoke(repos, actor, grant, clock.today()));
        if (grant && !parsed.value.done && grant.revokedOn) {
          await repos.access.updateGrant(grant.id, { revokedOn: null, revokedById: null });
          events.push(event(actor, grant.personId, { type: "access_grant", id: grant.id }, "access.restored", { system: grant.system, account: grant.account }));
        }
        return change({ id: item.id }, ...(events as [NewEvent, ...NewEvent[]]));
      });
    },

    async addItem(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "access.manage")) return forbidden(DENIED);
      const parsed = parse(addChecklistItemSchema, raw);
      if (!parsed.ok) return parsed;
      return commit(store, async (repos) => {
        const person = await repos.people.findById(parsed.value.personId);
        if (!person) return notFound("That person");
        const same = (await repos.access.listItems(person.id)).filter((i) => i.kind === parsed.value.kind);
        const id = newId();
        await repos.access.createItems([{ id, personId: person.id, kind: parsed.value.kind, title: parsed.value.title, position: same.length ? Math.max(...same.map((i) => i.position)) + 1 : 0, source: null }]);
        return change({ id }, event(actor, person.id, { type: "checklist_item", id }, "checklist.item_added", { title: parsed.value.title, kind: parsed.value.kind }));
      });
    },

    async removeItem(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "access.manage")) return forbidden(DENIED);
      const parsed = parse(checklistItemSchema, raw);
      if (!parsed.ok) return parsed;
      return commit(store, async (repos) => {
        const item = await repos.access.findItem(parsed.value.itemId);
        if (!item) return notFound("That step");
        if (item.source?.startsWith("access:")) return conflict("This step comes from the access register: remove the access there instead.");
        await repos.access.updateItem(item.id, { deletedAt: clock.now() });
        return change({ id: item.id }, event(actor, item.personId, { type: "checklist_item", id: item.id }, "checklist.item_removed", { title: item.title, kind: item.kind }));
      });
    },

    async templates(actor: Actor): Promise<Result<Record<ChecklistKind, string[]>>> {
      if (!can(actor, "access.manage")) return forbidden(DENIED);
      const [joining, exit] = await Promise.all([checklistTemplate(store, "joining"), checklistTemplate(store, "exit")]);
      return ok({ joining, exit });
    },

    /** HR edits a template: checklists started from now on use it; existing ones keep theirs. */
    async setTemplate(actor: Actor, raw: unknown): Promise<Result<{ items: number }>> {
      if (!can(actor, "access.manage")) return forbidden(DENIED);
      const parsed = parse(checklistTemplateSchema, raw);
      if (!parsed.ok) return parsed;
      const items = cleanTemplate(parsed.value.items);
      if (items.length === 0) return invalid("Add at least one step.", { items: ["Add at least one step."] });
      return commit(store, async (repos) => {
        const key = TEMPLATE_KEY[parsed.value.kind];
        const before = await checklistTemplate(repos, parsed.value.kind);
        if (JSON.stringify(before) === JSON.stringify(items)) return noChange({ items: items.length });
        await repos.calendar.setSetting(key, items, actor.personId);
        return change({ items: items.length }, { actorId: actor.personId, action: "setting.changed", entityType: "setting", entityId: settingId(key), data: { key, items: items.length } });
      });
    },
  };
}

export type AccessService = ReturnType<typeof createAccessService>;
