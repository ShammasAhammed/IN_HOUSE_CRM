// Space kits (Stage 14.4): a new team space starts ready to work, not empty. Applying a kit makes its starter project
// (with stages), recurring and one-off tasks, Docs pages, team goals and a board in the space, all ordinary records
// with their own events, in one transaction. Each item is remembered (space_kit_items), so applying again adds only
// what's missing (D-14.4b). Nothing is given to a person: tasks and goals start unowned (D-14.4a).
//   - Who: the owner or HR. Only the owner makes a new space or makes one private (14.2); Finance, HR and Founder
//     office kits make their space private and sensitive, and the preview says so first (D-14.4c).
//   - The owner may change a kit (leave items out, move recurring days, set goal targets); kept in settings.
import { generateKeyBetween } from "fractional-indexing";
import { z } from "zod";
import { isId, newId, settingId } from "@/lib/id";
import { forbidden, invalid, notFound, ok, type Result } from "@/lib/result";
import { parse } from "@/lib/validation/common";
import type { ClientRecord, DataStore, NewEvent, Repositories } from "@/repositories";
import { change, commit } from "./change";
import type { Clock } from "./clock";
import { can, clientScope, everything, type Actor } from "./permissions";
import { addDays, addMonths, startOfMonth } from "@/lib/dates";
import { boardSearchText, objectCount } from "./rules/boards";
import { periodOf } from "./rules/goals";
import { describeItem, KIT_KEYS, kitPlan, kitWith, SPACE_KITS, type KitItem, type KitKey, type KitOverrides, type SpaceKit } from "./rules/space-kits";

export type KitPreview = { kit: SpaceKit; space: { id: string; name: string; isPrivate: boolean } | null; newSpaceName: string | null; create: string[]; existing: string[]; privacy: string | null; notes: string[] };

const settingKey = (k: KitKey) => `space_kit:${k}`;
const target = z.object({ kit: z.enum(KIT_KEYS), spaceId: z.uuid().optional(), newSpaceName: z.string().trim().min(2).max(60).optional() });
const overridesSchema = z.object({ off: z.array(z.string().max(40)).max(40).default([]), days: z.record(z.string().max(40), z.number().int().min(1).max(31)).default({}), targets: z.record(z.string().max(40), z.number().int().min(0).max(1e12)).default({}) });

/** The owner or HR set up spaces with kits. */
export const appliesKits = (a: Actor) => can(a, "spaces.manage") || a.roles.includes("hr");

export function createSpaceKitService(deps: { store: DataStore; clock: Clock }) {
  const { store, clock } = deps;

  async function kit(key: KitKey): Promise<SpaceKit> {
    return kitWith(SPACE_KITS[key], (await store.calendar.getSetting<KitOverrides>(settingKey(key))) ?? {});
  }

  /** The space, when this person can see it and it is one of Oppllo's own spaces. */
  async function space(repos: Pick<Repositories, "clients">, actor: Actor, id: string): Promise<ClientRecord | null> {
    // HR manage members of every space but see only open ones and those they belong to (private stay private).
    const scope = can(actor, "spaces.members") ? everything(actor) : clientScope(actor);
    const c = isId(id) ? await repos.clients.findById(id, scope) : null;
    return c?.isInternal ? c : null;
  }

  async function plan(actor: Actor, raw: unknown): Promise<Result<KitPreview & { target: z.infer<typeof target> }>> {
    if (!appliesKits(actor)) return forbidden("The owner or HR set up spaces with kits.");
    const p = parse(target, raw);
    if (!p.ok) return p;
    const v = p.value;
    if (!v.spaceId && !v.newSpaceName) return invalid("Pick a space, or name a new one.");
    if (!v.spaceId && !can(actor, "spaces.manage")) return forbidden("Only the owner adds spaces. Pick an existing one.");
    const k = await kit(v.kit);
    const s = v.spaceId ? await space(store, actor, v.spaceId) : null;
    if (v.spaceId && !s) return notFound("That space");
    if (!s && v.newSpaceName && (await store.clients.findByName(v.newSpaceName))) return invalid("A client or space already has that name.", { newSpaceName: ["Pick another name, or apply the kit to that space."] });
    const done = new Set(s ? (await store.spaceKits.done(s.id, v.kit)).map((d) => d.itemKey) : []);
    const pl = kitPlan(k, done, s ? { isPrivate: s.isPrivate, isSensitive: s.isSensitive } : null);
    const notes: string[] = [];
    if (pl.privacy && !can(actor, "spaces.manage")) notes.push("Only the owner makes a space private: ask them to switch it on in Spaces.");
    notes.push(`Suggested access for its members: ${k.memberLevel}. Add people in Spaces; nothing here is given to anyone until then.`);
    return ok({ target: v, kit: k, space: s ? { id: s.id, name: s.name, isPrivate: s.isPrivate } : null, newSpaceName: s ? null : (v.newSpaceName ?? null), create: pl.create.map(describeItem), existing: pl.existing.map(describeItem), privacy: pl.privacy, notes });
  }

  return {
    /** Every kit, with the owner's changes, and where each was applied (spaces this person can see). */
    async list(actor: Actor): Promise<Array<SpaceKit & { appliedTo: Array<{ id: string; name: string }> }>> {
      const applied = await store.spaceKits.applied();
      const visible = new Set(await store.clients.visibleIds(clientScope(actor)));
      const names = new Map((await store.clients.listSpaces(clientScope(actor))).map((s) => [s.id, s.name]));
      return Promise.all(KIT_KEYS.map(async (k) => ({ ...(await kit(k)), appliedTo: applied.filter((a) => a.kit === k && visible.has(a.spaceId) && names.has(a.spaceId)).map((a) => ({ id: a.spaceId, name: names.get(a.spaceId)! })) })));
    },

    async get(key: string): Promise<Result<{ kit: SpaceKit; base: SpaceKit; overrides: KitOverrides }>> {
      const k = KIT_KEYS.find((x) => x === key);
      if (!k) return notFound("That kit");
      const overrides = (await store.calendar.getSetting<KitOverrides>(settingKey(k))) ?? {};
      return ok({ kit: kitWith(SPACE_KITS[k], overrides), base: SPACE_KITS[k], overrides });
    },

    /** What applying would make (and what it already made), before anything happens. */
    async preview(actor: Actor, raw: unknown): Promise<Result<KitPreview>> {
      const r = await plan(actor, raw);
      if (!r.ok) return r;
      const { target: _t, ...preview } = r.value;
      return ok(preview);
    },

    async apply(actor: Actor, raw: unknown): Promise<Result<{ spaceId: string; created: string[]; existing: string[]; privacy: string | null }>> {
      const r = await plan(actor, raw);
      if (!r.ok) return r;
      const { target: v, kit: k } = r.value;
      const today = clock.today();
      const now = clock.now();
      return commit(store, async (repos) => {
        const events: NewEvent[] = [];
        let spaceId = v.spaceId ?? null;
        if (!spaceId) {
          spaceId = newId();
          await repos.clients.createSpace(spaceId, { name: v.newSpaceName!, isPrivate: k.private });
          if (k.private) await repos.clients.updateSpace(spaceId, { isSensitive: true });
          events.push({ actorId: actor.personId, action: "space.created", entityType: "client", entityId: spaceId, clientId: spaceId, data: { name: v.newSpaceName, isPrivate: k.private, kit: k.key } });
        }
        const s = (await repos.clients.findById(spaceId, { kind: "all" }))!;
        // Private and sensitive by default for Finance, HR and Founder office; only the owner changes privacy (14.2),
        // and never by surprise for people already working there (the same check as Spaces).
        let privacy: string | null = null;
        if (k.private && can(actor, "spaces.manage") && (!s.isPrivate || !s.isSensitive)) {
          const outsiders = s.isPrivate ? [] : (await repos.clients.outsidersOnWork(s.id)).length;
          if (outsiders) privacy = "Not made private: people outside the space have open work in it. Add them as members first, then switch it on in Spaces.";
          else {
            await repos.clients.updateSpace(s.id, { isPrivate: true, isSensitive: true });
            events.push({ actorId: actor.personId, action: "space.updated", entityType: "client", entityId: s.id, clientId: s.id, data: { after: { isPrivate: true, isSensitive: true }, kit: k.key } });
            privacy = "Made private and sensitive.";
          }
        }
        const done = new Map((await repos.spaceKits.done(s.id, k.key)).map((d) => [d.itemKey, d]));
        const made: string[] = [];
        const record = async (item: KitItem, entityType: string, entityId: string) => {
          await repos.spaceKits.add({ spaceId: s.id, kit: k.key, itemKey: item.key, entityType, entityId, createdById: actor.personId, at: now });
          made.push(describeItem(item));
        };
        const ev = (action: string, entityType: NewEvent["entityType"], entityId: string, data: Record<string, unknown>): NewEvent => ({ actorId: actor.personId, action, entityType, entityId, clientId: s.id, data: { ...data, kit: k.key } });

        // The project first: recurring and one-off tasks belong to it (this apply's, or the one made before).
        let projectId = done.get("project")?.entityId ?? null;
        let firstStage: string | null = null;
        for (const item of k.items) {
          if (done.has(item.key)) continue;
          const id = newId();
          switch (item.kind) {
            case "project": {
              await repos.projects.create(id, { clientId: s.id, engagementId: null, name: item.name, description: item.description, status: "active", leadId: null, startDate: today, dueDate: null, createdById: actor.personId });
              const stages = item.stages.map((name, position) => ({ id: newId(), projectId: id, name, position }));
              await repos.projects.createStages(stages);
              await repos.projects.update(id, { currentStageId: stages[0]!.id });
              projectId = id;
              firstStage = stages[0]!.id;
              events.push(ev("project.created", "project", id, { name: item.name, starterTasks: 0 }));
              break;
            }
            case "recurring": {
              if (!projectId) continue;
              await repos.projects.createRecurrence(id, { projectId, clientId: s.id, title: item.title, description: item.description, ownerId: null, reviewerId: null, priority: "normal", stageId: null, deliverableId: null, estimateMinutes: null, frequency: item.frequency, weekday: item.frequency === "weekly" ? (item.weekday ?? 1) : null, dayOfMonth: item.frequency === "monthly" ? (item.dayOfMonth ?? 1) : null, leadWorkingDays: item.leadWorkingDays, startsOn: today, endsOn: null, active: true, createdById: actor.personId });
              events.push(ev("task_recurrence.created", "task_recurrence", id, { title: item.title }));
              break;
            }
            case "task": {
              if (!projectId) continue;
              const rank = generateKeyBetween(await repos.tasks.lastRank(projectId, "todo"), null);
              await repos.tasks.create(id, { projectId, clientId: s.id, parentTaskId: null, title: item.title, description: item.description, status: "todo", priority: "normal", ownerId: null, reviewerId: null, stageId: firstStage, deliverableId: null, startDate: null, dueDate: addDays(today, item.dueInDays), estimateMinutes: null, completedAt: null, rank, recurrenceId: null, createdById: actor.personId });
              events.push(ev("task.created", "task", id, { title: item.title }));
              break;
            }
            case "doc": {
              await repos.docs.create({ id, title: item.title, body: item.body, parentId: null, clientId: s.id, position: 0, createdById: actor.personId });
              await repos.docs.addVersion({ id: newId(), docId: id, version: 1, title: item.title, body: item.body, editedById: actor.personId });
              events.push(ev("doc.created", "doc", id, { title: item.title }));
              break;
            }
            case "goal": {
              const { startsOn, endsOn } = periodOf(item.period, today);
              await repos.goals.create({ id, parentId: null, title: item.title, description: "", unit: item.unit, target: item.target, period: item.period, startsOn, endsOn, source: item.source, ownerId: null, spaceId: s.id, leadersOnly: false, createdById: actor.personId, at: now });
              events.push(ev("goal.created", "goal", id, { title: item.title, level: "team", source: item.source }));
              break;
            }
            case "board": {
              const elements = item.scene(() => newId()).elements;
              const scene = { elements, appState: {} };
              await repos.boards.create({ id, clientId: s.id, projectId: null, title: item.title, section: null, tags: k.tags, scene, searchText: boardSearchText(elements), objectCount: objectCount(elements), sceneBytes: JSON.stringify(scene).length, template: null, createdById: actor.personId, updatedById: actor.personId, at: now });
              events.push(ev("board.created", "board", id, { title: item.title }));
              break;
            }
            case "self": {
              // One space is Oppllo's own marketing; the owner decides, and an existing one is never taken over.
              const current = await repos.clients.selfSpaceId();
              if (!can(actor, "spaces.manage") || (current && current !== s.id)) continue;
              if (current !== s.id) {
                await repos.clients.updateSpace(s.id, { isSelf: true });
                events.push({ actorId: actor.personId, action: "space.updated", entityType: "client", entityId: s.id, clientId: s.id, data: { after: { isSelf: true }, kit: k.key } });
              }
              await record(item, "client", s.id);
              continue;
            }
            case "results_targets": {
              const month = startOfMonth(today);
              const [row] = await repos.results.list({ clientIds: [s.id], from: month, to: month });
              const resultId = row?.id ?? (await repos.results.save(id, { clientId: s.id, engagementId: null, month, leads: null, spendPaise: null, callsBooked: null, admissions: null, targetLeads: item.leads, targetAdmissions: item.won, leadsSource: "manual", spendSource: "manual", updatedById: actor.personId }, now));
              if (!row) events.push(ev("client.results_saved", "client_result", resultId, { month, after: { targetLeads: item.leads, targetAdmissions: item.won } }));
              await record(item, "client_result", resultId);
              continue;
            }
            case "content": {
              const next = startOfMonth(addMonths(today, 1));
              let first: string | null = null;
              for (const p of item.posts) {
                const cid = newId();
                first ??= cid;
                await repos.content.create(cid, { clientId: s.id, title: p.title, channel: p.channel, publishOn: addDays(next, p.day - 1), publishTime: null, status: "idea", assetId: null, ownerId: null, caption: null, publishedUrl: null, createdById: actor.personId });
                events.push(ev("content.created", "content_item", cid, { title: p.title }));
              }
              if (first) await record(item, "content_item", first);
              continue;
            }
          }
          await record(item, item.kind === "recurring" ? "task_recurrence" : item.kind, id);
        }
        events.push({ actorId: actor.personId, action: "space_kit.applied", entityType: "space_kit", entityId: s.id, clientId: s.id, data: { kit: k.key, created: made.length } });
        return change({ spaceId: s.id, created: made, existing: k.items.filter((i) => done.has(i.key)).map(describeItem), privacy }, ...(events as [NewEvent, ...NewEvent[]]));
      });
    },

    /** The owner changes a kit: leave items out, other days for recurring tasks, goal targets. */
    async setOverrides(actor: Actor, key: string, raw: unknown): Promise<Result<null>> {
      if (!can(actor, "spaces.manage")) return forbidden("Only the owner changes the kits.");
      const k = KIT_KEYS.find((x) => x === key);
      if (!k) return notFound("That kit");
      const p = parse(overridesSchema, raw);
      if (!p.ok) return p;
      const known = new Set(SPACE_KITS[k].items.map((i) => i.key));
      if ([...p.value.off, ...Object.keys(p.value.days), ...Object.keys(p.value.targets)].some((x) => !known.has(x))) return invalid("That isn't part of the kit.");
      for (const [itemKey, day] of Object.entries(p.value.days)) {
        const item = SPACE_KITS[k].items.find((i) => i.key === itemKey);
        if (item?.kind === "recurring" && item.frequency === "weekly" && day > 6) return invalid("Weekly tasks take a day from 1 (Monday) to 6 (Saturday).");
        if (item?.kind === "recurring" && item.frequency === "monthly" && day > 28 && day !== 31) return invalid("Pick a day from 1 to 28, or 31 for the last working day.");
      }
      return commit(store, async (repos) => {
        await repos.calendar.setSetting(settingKey(k), p.value, actor.personId);
        return change(null, { actorId: actor.personId, action: "setting.changed", entityType: "setting", entityId: settingId(settingKey(k)), data: { key: settingKey(k), ...p.value } });
      });
    },
  };
}

export type SpaceKitService = ReturnType<typeof createSpaceKitService>;
