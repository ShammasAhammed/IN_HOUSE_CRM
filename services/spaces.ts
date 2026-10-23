// Spaces (Stage 14.1): Oppllo's own work areas (Founder office, Finance, HR, Sales, Marketing, Operations…) next to
// client spaces. A space is an internal client (D-14.1a), so projects, tasks, board, docs, recurring tasks, templates
// and automations work in it unchanged. A private space is seen only by its members and the owner: the database
// scopes enforce that (adapters/postgres/sql.ts notHiddenFrom), and hiddenFor() covers lists built in memory.
import { z } from "zod";
import type { IsoDate } from "@/lib/dates";
import { ACCESS_LEVEL_LABELS, type AccessLevel } from "@/lib/types";
import { newId } from "@/lib/id";
import { forbidden, invalid, notFound, ok, type Failure, type Result } from "@/lib/result";
import { parse } from "@/lib/validation/common";
import type { DataStore, NewEvent, Repositories } from "@/repositories";
import { change, commit, noChange } from "./change";
import type { Clock } from "./clock";
import { can, clientScope, seesAllSpaces, type Actor } from "./permissions";
import { atLeast } from "./rules/access";

/** Private spaces this person may not see (none for the owner). */
export async function hiddenFor(repos: Pick<Repositories, "clients">, actor: Actor): Promise<ReadonlySet<string>> {
  return seesAllSpaces(actor) ? new Set() : new Set(await repos.clients.hiddenSpaces(actor.personId));
}

const LEVEL_DOES: Record<"comment" | "edit" | "manage", string> = { comment: "comment here", edit: "change work here", manage: "manage this space" };

/**
 * Stage 14.2 (D-14.2a): a space member's level limits what they may do inside it, whatever their role allows elsewhere.
 * People who aren't members keep their role's rights (client teams count as "edit"); the owner may do everything.
 * Returns the refusal, or null when allowed.
 */
export async function levelBlocks(repos: Pick<Repositories, "clients">, actor: Actor, clientId: string, need: "comment" | "edit" | "manage"): Promise<Failure | null> {
  if (seesAllSpaces(actor)) return null;
  const me = (await repos.clients.listMembers(clientId)).find((m) => m.personId === actor.personId);
  if (!me || atLeast(me.level, need)) return null;
  return forbidden(`Your access to this space is "${ACCESS_LEVEL_LABELS[me.level]}", so you can't ${LEVEL_DOES[need]}. Ask the owner or HR for more.`);
}

export const OUTSIDE_SPACE = "Add them to the space first: it's private, so only its members (and the owner) can see its work.";

/**
 * "Is this person outside this private space?" for one transaction or job, remembered per person. The owner is never
 * outside. Used before putting someone on work (owner, reviewer, assignee, watcher, form owner, rule actions) and
 * before telling anyone about it (notifications, the daily job), so nobody is given or told about work they can't see.
 */
export function spaceGuard(repos: Pick<Repositories, "clients" | "people">): (personId: string, clientId: string) => Promise<boolean> {
  const hidden = new Map<string, ReadonlySet<string>>();
  return async (personId, clientId) => {
    if (!hidden.has(personId)) {
      const p = await repos.people.findById(personId);
      hidden.set(personId, p?.roles.includes("owner") ? new Set() : new Set(await repos.clients.hiddenSpaces(personId)));
    }
    return hidden.get(personId)!.has(clientId);
  };
}

export const SUGGESTED_SPACES: ReadonlyArray<{ name: string; isPrivate: boolean }> = [
  { name: "Founder office", isPrivate: true },
  { name: "Finance", isPrivate: true },
  { name: "HR", isPrivate: true },
  { name: "Sales", isPrivate: false },
  { name: "Oppllo Marketing", isPrivate: false },
  { name: "Operations", isPrivate: false },
];

const nameSchema = z.string().trim().min(2, { message: "Give the space a name." }).max(60, { message: "Keep the name under 60 characters." });
const createSchema = z.object({ name: nameSchema, isPrivate: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()) });
const tick = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
const updateSchema = z.object({ spaceId: z.uuid(), name: nameSchema, isPrivate: tick, isSensitive: tick, archived: tick, isSelf: tick });

export type SpaceView = {
  id: string;
  name: string;
  isPrivate: boolean;
  archived: boolean;
  isSensitive: boolean;
  isSelf: boolean;
  /** Members: shown to people who manage spaces or can open this one. */
  members: Array<{ personId: string; fullName: string; level: AccessLevel; expiresOn: IsoDate | null }>;
  /** May open the space's work (projects, tasks, docs). */
  canOpen: boolean;
  /** May ask for someone's access here: the owner, HR, or the space's own managers (Stage 14.2). */
  canAsk: boolean;
  /** May rename or archive it: the owner, or the space's managers. */
  canEdit: boolean;
};
export type SpacesPage = { spaces: SpaceView[]; canManage: boolean; canManageMembers: boolean; people: Array<{ id: string; name: string }>; missingSuggested: string[] };

export function createSpaceService(deps: { store: DataStore; clock: Clock }) {
  const { store } = deps;
  const manager = (actor: Actor) => can(actor, "spaces.manage");
  const membersManager = (actor: Actor) => can(actor, "spaces.members");

  /** A live space, whatever its privacy: callers have checked the person may manage spaces or their members. */
  async function findSpace(repos: Pick<Repositories, "clients">, id: string) {
    return (await repos.clients.listSpaces({ kind: "all" })).find((s) => s.id === id) ?? null;
  }
  const spaceEvent = (actor: Actor, spaceId: string, action: string, data: Record<string, unknown>, personId?: string): NewEvent => ({
    actorId: actor.personId,
    action,
    entityType: "client",
    entityId: spaceId,
    clientId: spaceId,
    personId: personId ?? null,
    data,
  });

  return {
    async list(actor: Actor): Promise<Result<SpacesPage>> {
      const scope = clientScope(actor);
      const manages = manager(actor) || membersManager(actor);
      // Space managers (Stage 14.2) ask for access too, so they need the people list.
      const asks = manages || (await store.clients.spaceMembershipsOf(actor.personId)).some((m) => atLeast(m.level, "manage"));
      if (!manages && scope.kind === "none") return forbidden("Spaces aren't part of your role.");
      // People who manage members see every space's name and members (not its work); everyone else, what they can open.
      const [spaces, openable, people] = await Promise.all([
        store.clients.listSpaces(manages ? { kind: "all" } : scope),
        store.clients.visibleIds(scope),
        asks ? store.people.listActive() : Promise.resolve([]),
      ]);
      const open = new Set(openable);
      const members = await Promise.all(spaces.map((s) => (manages || open.has(s.id) ? store.clients.listMembers(s.id) : Promise.resolve([]))));
      const names = new Set(spaces.map((s) => s.name.toLowerCase()));
      return ok({
        spaces: spaces.map((s, i) => {
          const mine = members[i]!.find((m) => m.personId === actor.personId);
          const managesHere = Boolean(mine && atLeast(mine.level, "manage"));
          return {
            id: s.id,
            name: s.name,
            isPrivate: s.isPrivate,
            isSensitive: s.isSensitive,
            isSelf: s.isSelf,
            archived: s.status === "churned",
            members: members[i]!.map((m) => ({ personId: m.personId, fullName: m.fullName, level: m.level, expiresOn: m.expiresOn })),
            canOpen: open.has(s.id),
            canAsk: membersManager(actor) || managesHere,
            canEdit: manager(actor) || managesHere,
          };
        }),
        canManage: manager(actor),
        canManageMembers: membersManager(actor),
        people: people.filter((p) => !p.roles.includes("owner")).map((p) => ({ id: p.id, name: p.fullName })),
        missingSuggested: manager(actor) ? SUGGESTED_SPACES.filter((x) => !names.has(x.name.toLowerCase())).map((x) => x.name) : [],
      });
    },

    async create(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!manager(actor)) return forbidden("Only the owner adds spaces.");
      const parsed = parse(createSchema, raw);
      if (!parsed.ok) return parsed;
      const { name, isPrivate } = parsed.value;
      return commit(store, async (repos) => {
        if (await repos.clients.findByName(name)) return invalid("A client or space already has that name.", { name: ["Pick another name."] });
        const id = newId();
        await repos.clients.createSpace(id, { name, isPrivate });
        return change({ id }, spaceEvent(actor, id, "space.created", { name, isPrivate }));
      });
    },

    /** The suggested starting set, those not made yet. Founder office, Finance and HR start private. */
    async addSuggested(actor: Actor): Promise<Result<{ created: number }>> {
      if (!manager(actor)) return forbidden("Only the owner adds spaces.");
      return commit(store, async (repos) => {
        const events: NewEvent[] = [];
        for (const s of SUGGESTED_SPACES) {
          if (await repos.clients.findByName(s.name)) continue;
          const id = newId();
          await repos.clients.createSpace(id, s);
          events.push(spaceEvent(actor, id, "space.created", { name: s.name, isPrivate: s.isPrivate }));
        }
        return events.length ? change({ created: events.length }, ...(events as [NewEvent, ...NewEvent[]])) : noChange({ created: 0 });
      });
    },

    /** Rename, make private or not, archive or bring back. Making a space private hides it at once from non-members. */
    async update(actor: Actor, raw: unknown): Promise<Result<null>> {
      const parsed = parse(updateSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      return commit(store, async (repos) => {
        const before = await findSpace(repos, v.spaceId);
        if (!before) return notFound("That space");
        // The owner changes anything; a space's managers rename and archive it, never its privacy (D-14.2a).
        const managesHere = (await repos.clients.listMembers(before.id)).some((m) => m.personId === actor.personId && atLeast(m.level, "manage"));
        if (!manager(actor) && !managesHere) return forbidden("Only the owner or this space's managers change it.");
        if (!manager(actor) && (v.isPrivate !== before.isPrivate || v.isSensitive !== before.isSensitive)) return forbidden("Only the owner makes a space private or sensitive.");
        // Stage 14.5: which space is Oppllo's own marketing (results and a monthly self-report) is the owner's call.
        const isSelf = manager(actor) ? v.isSelf : before.isSelf;
        const status = v.archived ? "churned" : "active";
        if (before.name === v.name && before.isPrivate === v.isPrivate && before.isSensitive === v.isSensitive && before.status === status && before.isSelf === isSelf) return noChange(null);
        if (before.name.toLowerCase() !== v.name.toLowerCase() && (await repos.clients.findByName(v.name, before.id))) return invalid("A client or space already has that name.", { name: ["Pick another name."] });
        // Going private must not silently cut people off their own work: name them, to add as members or take off it.
        if (v.isPrivate && !before.isPrivate) {
          const people = await Promise.all((await repos.clients.outsidersOnWork(before.id)).map((id) => repos.people.findById(id)));
          const names = people.filter((p) => p && !p.roles.includes("owner")).map((p) => p!.fullName);
          if (names.length) {
            return invalid(`Before making it private, add these people to the space or take them off its open work: ${names.join(", ")}.`, { isPrivate: [`Add first: ${names.join(", ")}.`] });
          }
        }
        await repos.clients.updateSpace(before.id, { name: v.name, isPrivate: v.isPrivate, isSensitive: v.isSensitive, isSelf, status });
        return change(null, spaceEvent(actor, before.id, "space.updated", { before: { name: before.name, isPrivate: before.isPrivate, isSensitive: before.isSensitive, archived: before.status === "churned", isSelf: before.isSelf }, after: { name: v.name, isPrivate: v.isPrivate, isSensitive: v.isSensitive, archived: v.archived, isSelf } }));
      });
    },

  };
}
export type SpaceService = ReturnType<typeof createSpaceService>;
