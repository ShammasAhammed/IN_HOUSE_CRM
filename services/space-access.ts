// Access to spaces (Stage 14.2): nobody gets access by accident, and everyone knows what they were given.
// The owner or HR (or a space's manager) asks: who, which space, which level, why, until when. A different person of
// the owner and HR approves or refuses (D-14.2b). The member reads in plain words what they can and can't do, who asked
// and approved, and until when; access opens only when they press "I understand". Removing access is one step and
// instant. Access ends on its date; the owner reviews every space's members every 90 days; leaving removes it all.
// Every step is an event. Events about access carry no clientId, so a person outside a private space still hears
// about their own access to it (the space guard would otherwise drop the message).
import { z } from "zod";
import { addDays, isIsoDate, type IsoDate } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { isId, newId } from "@/lib/id";
import { conflict, forbidden, invalid, notFound, ok, type Result } from "@/lib/result";
import { ACCESS_LEVEL_LABELS, ACCESS_LEVELS, TWO_STEP_ANSWERS, type AccessLevel } from "@/lib/types";
import { optionalText, parse } from "@/lib/validation/common";
import type { AccessRequestRecord, ClientRecord, DataStore, NewEvent, NotificationWrite, PersonRecord, Repositories } from "@/repositories";
import { change, commit, noChange } from "./change";
import type { Clock } from "./clock";
import { can, type Actor } from "./permissions";
import { accessPreview, atLeast, levelWords, mayDecide, memberMessage } from "./rules/access";

export const REVIEW_EVERY_DAYS = 90;
export const WARN_DAYS_BEFORE_END = 7;

const askSchema = z.object({
  spaceId: z.uuid({ message: "Pick a space." }),
  personId: z.uuid({ message: "Pick a person." }),
  level: z.enum(ACCESS_LEVELS, { message: "Pick a level." }),
  reason: z.string().trim().min(5, { message: "Say why, in a few words." }).max(300, { message: "Keep it under 300 characters." }),
  expiresOn: z
    .string()
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || isIsoDate(v), { message: "Enter a valid date." }),
  twoStep: z.union([z.literal(""), z.enum(TWO_STEP_ANSWERS)]).optional().transform((v) => v || null),
});
const decideSchema = z.object({ requestId: z.uuid(), decision: z.enum(["approve", "refuse"]), note: optionalText(300) });
const removeSchema = z.object({ spaceId: z.uuid(), personId: z.uuid(), note: optionalText(300) });

export type AccessPreview = { text: string; can: string[]; cannot: string[]; sensitive: boolean };
export type MyAccess = {
  spaces: Array<{ spaceId: string; name: string; isPrivate: boolean; level: AccessLevel; levelLabel: string; can: string[]; cannot: string[]; expiresOn: IsoDate | null; since: Date }>;
  /** Approved, waiting for "I understand". */
  toConfirm: Array<{ requestId: string; spaceName: string; level: AccessLevel; message: string }>;
};
export type AccessAdmin = {
  pending: Array<AccessRequestRecord & { preview: string; canDecide: boolean; whyNot: string | null }>;
  awaitingMember: AccessRequestRecord[];
  recent: AccessRequestRecord[];
  ending: Array<{ spaceName: string; fullName: string; expiresOn: IsoDate }>;
  review: Array<{ spaceId: string; name: string; isPrivate: boolean; reviewedAt: Date | null; due: boolean; members: Array<{ personId: string; fullName: string; level: AccessLevel; expiresOn: IsoDate | null }> }>;
  hrExists: boolean;
  isOwner: boolean;
};

/** Take someone out of a space at once: membership and any open request for it. Used by remove, expiry and leaving. */
async function endAccess(repos: Repositories, spaceId: string, personId: string, at: Date): Promise<boolean> {
  const removed = await repos.clients.removeMember(spaceId, personId);
  for (const r of await repos.spaceAccess.list({ spaceId, personId, statuses: ["pending", "approved"] })) await repos.spaceAccess.update(r.id, r.status, { status: "cancelled" }, at);
  return removed;
}

const accessEvent = (actorId: string | null, action: string, entityId: string, personId: string, data: Record<string, unknown>, entityType: "space_access_request" | "client" = "space_access_request"): NewEvent => ({
  actorId,
  action,
  entityType,
  entityId,
  personId,
  clientId: null,
  data,
});

/** Leaving the company (D77, called from people.markLeft): every space membership and open request ends with the exit. */
export async function endAllSpaceAccess(repos: Repositories, personId: string, actorId: string, at: Date): Promise<NewEvent[]> {
  const events: NewEvent[] = [];
  for (const m of await repos.clients.spaceMembershipsOf(personId)) {
    await endAccess(repos, m.spaceId, personId, at);
    events.push(accessEvent(actorId, "space.access_removed", m.spaceId, personId, { space: m.name, spaceId: m.spaceId, reason: "left Oppllo" }, "client"));
  }
  for (const r of await repos.spaceAccess.list({ personId, statuses: ["pending", "approved"] })) await repos.spaceAccess.update(r.id, r.status, { status: "cancelled" }, at);
  return events;
}

const ownerOrHr = (p: Pick<PersonRecord, "roles">) => p.roles.includes("owner") || p.roles.includes("hr");
const sensitiveSpace = (s: Pick<ClientRecord, "isPrivate" | "isSensitive">) => s.isPrivate || s.isSensitive;

export function createSpaceAccessService(deps: { store: DataStore; clock: Clock }) {
  const { store, clock } = deps;

  async function space(repos: Pick<Repositories, "clients">, id: string) {
    if (!isId(id)) return null;
    return (await repos.clients.listSpaces({ kind: "all" })).find((s) => s.id === id) ?? null;
  }
  /** The owner and HR ask for anyone; a space's own managers ask for their space. */
  async function mayAsk(repos: Pick<Repositories, "clients">, actor: Actor, spaceId: string) {
    if (can(actor, "spaces.members")) return true;
    return (await repos.clients.listMembers(spaceId)).some((m) => m.personId === actor.personId && atLeast(m.level, "manage"));
  }
  const roleOf = (p: PersonRecord) => ({ id: p.id, isOwner: p.roles.includes("owner"), isHr: p.roles.includes("hr") });

  async function decisionRule(repos: Pick<Repositories, "people">, actor: Actor, r: AccessRequestRecord) {
    const [active, requester, me] = await Promise.all([repos.people.listActive(), repos.people.findById(r.requestedById), repos.people.findById(actor.personId)]);
    if (!me || me.status !== "active" || !requester) return { ok: false as const, message: "Only the owner or HR approves access." };
    return mayDecide({ requester: roleOf(requester), approver: roleOf(me), sensitive: r.isPrivate || r.isSensitive, hrExists: active.some((p) => p.roles.includes("hr")) });
  }

  return {
    /** The words shown before sending: what they will and won't be able to do. */
    async preview(actor: Actor, raw: unknown): Promise<Result<AccessPreview>> {
      const parsed = parse(askSchema.partial({ reason: true }), raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      const [s, person] = await Promise.all([space(store, v.spaceId!), store.people.findById(v.personId!)]);
      if (!s || !person || !(await mayAsk(store, actor, s.id))) return notFound("That space or person");
      const w = levelWords(v.level!);
      return ok({ text: accessPreview({ personName: person.fullName, spaceName: s.name, level: v.level!, expiresOn: v.expiresOn ?? null, isPrivate: s.isPrivate }), ...w, sensitive: sensitiveSpace(s) });
    },

    async ask(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      const parsed = parse(askSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      return commit(store, async (repos) => {
        const s = await space(repos, v.spaceId);
        if (!s || !(await mayAsk(repos, actor, s.id))) return forbidden("Only the owner, HR or this space's managers ask for access.");
        const person = await repos.people.findById(v.personId);
        if (!person || person.status !== "active") return invalid("Pick someone on the team.", { personId: ["Pick someone on the team."] });
        if (person.roles.includes("owner")) return invalid("The owner already sees every space.", { personId: ["The owner already sees every space."] });
        if (v.expiresOn && v.expiresOn <= clock.today()) return invalid("Pick a last day after today, or leave it empty.", { expiresOn: ["After today, or empty."] });
        // Google 2-step sign-in can't be checked from here: for sensitive spaces the asker says what they know.
        if (sensitiveSpace(s) && !v.twoStep) return invalid("Say whether their Google account has 2-step sign-in.", { twoStep: ["Pick yes or not sure."] });
        const current = (await repos.clients.listMembers(s.id)).find((m) => m.personId === person.id);
        if (current && current.level === v.level && current.expiresOn === v.expiresOn) return invalid(`${person.fullName} already has ${ACCESS_LEVEL_LABELS[v.level].toLowerCase()} access to ${s.name}.`);
        const id = newId();
        if (!(await repos.spaceAccess.create({ id, spaceId: s.id, personId: person.id, level: v.level, reason: v.reason, expiresOn: v.expiresOn, twoStep: v.twoStep, requestedById: actor.personId }))) {
          return conflict(`There's already an open request for ${person.fullName} in ${s.name}.`);
        }
        return change({ id }, accessEvent(actor.personId, "space.access_requested", id, person.id, { space: s.name, spaceId: s.id, name: person.fullName, level: v.level, sensitive: sensitiveSpace(s), expiresOn: v.expiresOn, twoStep: v.twoStep }));
      });
    },

    async decide(actor: Actor, raw: unknown): Promise<Result<{ status: "approved" | "refused" }>> {
      const parsed = parse(decideSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      return commit(store, async (repos) => {
        const r = await repos.spaceAccess.find(v.requestId);
        if (!r || !(can(actor, "spaces.members"))) return notFound("That request");
        if (r.status !== "pending") return conflict("This request was already decided.");
        const rule = await decisionRule(repos, actor, r);
        if (!rule.ok) return forbidden(rule.message);
        const status = v.decision === "approve" ? "approved" : "refused";
        if (status === "refused" && !v.note) return invalid("Say why it's refused: the asker reads this.", { note: ["Say why."] });
        if (!(await repos.spaceAccess.update(r.id, "pending", { status, decidedById: actor.personId, decidedAt: clock.now(), decisionNote: v.note, ownerAlone: status === "approved" && rule.ownerAlone }, clock.now()))) return conflict("This request was already decided.");
        const me = await repos.people.findById(actor.personId);
        const message = memberMessage({ spaceName: r.spaceName, level: r.level, expiresOn: r.expiresOn, requestedByName: r.requestedByName, decidedByName: me?.fullName ?? "the approver", ownerAlone: rule.ownerAlone, reason: r.reason, isPrivate: r.isPrivate });
        return change(
          { status },
          accessEvent(actor.personId, `space.access_${status}`, r.id, r.personId, {
            space: r.spaceName,
            spaceId: r.spaceId,
            name: r.personName,
            level: r.level,
            sensitive: r.isPrivate || r.isSensitive,
            requestedById: r.requestedById,
            note: v.note,
            ...(status === "approved" ? { ownerAlone: rule.ownerAlone, message } : {}),
          }),
        );
      });
    },

    /** The member's "I understand": only now does the membership exist. */
    async confirm(actor: Actor, requestId: string): Promise<Result<null>> {
      if (!isId(requestId)) return notFound("That request");
      return commit(store, async (repos) => {
        const r = await repos.spaceAccess.find(requestId);
        if (!r || r.personId !== actor.personId) return notFound("That request");
        if (r.status !== "approved") return conflict(r.status === "confirmed" ? "You already confirmed this." : "This access isn't waiting for you.");
        if (r.expiresOn && r.expiresOn < clock.today()) return conflict("This access ended before you confirmed it. Ask again if you still need it.");
        if (!(await repos.spaceAccess.update(r.id, "approved", { status: "confirmed", confirmedAt: clock.now() }, clock.now()))) return conflict("You already confirmed this.");
        await repos.clients.setMember({ clientId: r.spaceId, personId: r.personId, level: r.level, expiresOn: r.expiresOn, requestId: r.id });
        return change(null, accessEvent(actor.personId, "space.access_confirmed", r.id, r.personId, { space: r.spaceName, spaceId: r.spaceId, name: r.personName, level: r.level, expiresOn: r.expiresOn }));
      });
    },

    /** One step, instant: the owner or HR takes someone out of a space; they're told. */
    async remove(actor: Actor, raw: unknown): Promise<Result<null>> {
      if (!can(actor, "spaces.members")) return forbidden("The owner and HR remove access.");
      const parsed = parse(removeSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      return commit(store, async (repos) => {
        const s = await space(repos, v.spaceId);
        if (!s) return notFound("That space");
        const person = await repos.people.findById(v.personId);
        if (!(await endAccess(repos, s.id, v.personId, clock.now()))) return notFound("They aren't a member of this space.");
        return change(null, accessEvent(actor.personId, "space.access_removed", s.id, v.personId, { space: s.name, spaceId: s.id, name: person?.fullName ?? "someone", note: v.note }, "client"));
      });
    },

    /** "My access": every space and level in plain words, and anything waiting for "I understand". */
    async mine(actor: Actor): Promise<MyAccess> {
      const [spaces, approved] = await Promise.all([store.clients.spaceMembershipsOf(actor.personId), store.spaceAccess.list({ personId: actor.personId, statuses: ["approved"] })]);
      return {
        spaces: spaces.map((s) => ({ ...s, levelLabel: ACCESS_LEVEL_LABELS[s.level], ...levelWords(s.level) })),
        toConfirm: approved.map((r) => ({
          requestId: r.id,
          spaceName: r.spaceName,
          level: r.level,
          message: memberMessage({ spaceName: r.spaceName, level: r.level, expiresOn: r.expiresOn, requestedByName: r.requestedByName, decidedByName: r.decidedByName ?? "the approver", ownerAlone: r.ownerAlone, reason: r.reason, isPrivate: r.isPrivate }),
        })),
      };
    },

    /** The owner's and HR's page: requests to decide, waiting members, access ending soon, the 90-day review. */
    async admin(actor: Actor): Promise<Result<AccessAdmin>> {
      if (!can(actor, "spaces.members")) return forbidden("Access is managed by the owner and HR.");
      const today = clock.today();
      const [pending, awaiting, recent, ending, spaces, active] = await Promise.all([
        store.spaceAccess.list({ statuses: ["pending"] }),
        store.spaceAccess.list({ statuses: ["approved"] }),
        store.spaceAccess.list({ statuses: ["confirmed", "refused", "cancelled"] }),
        store.clients.spaceMembersEnding({ from: today, to: addDays(today, WARN_DAYS_BEFORE_END) }),
        store.clients.listSpaces({ kind: "all" }),
        store.people.listActive(),
      ]);
      const members = await Promise.all(spaces.map((s) => store.clients.listMembers(s.id)));
      const reviewBefore = new Date(clock.now().getTime() - REVIEW_EVERY_DAYS * 86_400_000);
      return ok({
        pending: await Promise.all(
          pending.map(async (r) => {
            const rule = await decisionRule(store, actor, r);
            return { ...r, preview: accessPreview({ personName: r.personName, spaceName: r.spaceName, level: r.level, expiresOn: r.expiresOn, isPrivate: r.isPrivate }), canDecide: rule.ok, whyNot: rule.ok ? null : rule.message };
          }),
        ),
        awaitingMember: awaiting,
        recent: recent.slice(0, 20),
        ending: ending.map((e) => ({ spaceName: e.spaceName, fullName: e.fullName, expiresOn: e.expiresOn })),
        review: spaces
          .map((s, i) => ({ spaceId: s.id, name: s.name, isPrivate: s.isPrivate, reviewedAt: s.accessReviewedAt, due: !s.accessReviewedAt || s.accessReviewedAt < reviewBefore, members: members[i]!.map((m) => ({ personId: m.personId, fullName: m.fullName, level: m.level, expiresOn: m.expiresOn })) }))
          .filter((s) => s.members.length > 0),
        hrExists: active.some((p) => p.roles.includes("hr")),
        isOwner: actor.roles.includes("owner"),
      });
    },

    /** The owner's 90-day review: whoever is still listed is kept (remove the others first). */
    async markReviewed(actor: Actor, spaceId: string): Promise<Result<null>> {
      if (!actor.roles.includes("owner")) return forbidden("The owner reviews spaces' members.");
      return commit(store, async (repos) => {
        const s = await space(repos, spaceId);
        if (!s) return notFound("That space");
        const kept = (await repos.clients.listMembers(s.id)).map((m) => m.fullName);
        await repos.clients.markReviewed(s.id, clock.now());
        return change(null, { actorId: actor.personId, action: "space.access_reviewed", entityType: "client", entityId: s.id, clientId: null, data: { space: s.name, kept } });
      });
    },

    /** The daily job: access ends on its day; the owner and HR hear a week before; reviews come due. */
    async runDaily(): Promise<{ expired: number; warned: number; reviewsDue: number; errors: unknown[] }> {
      const today = clock.today();
      const now = clock.now();
      const notes: Array<NotificationWrite & { id: string }> = [];
      let expired = 0;
      const ended = await store.clients.spaceMembersEnding({ before: today });
      for (const m of ended) {
        const done = await commit(store, async (repos) => {
          if (!(await endAccess(repos, m.spaceId, m.personId, now))) return noChange(false);
          return change(true, accessEvent(null, "space.access_expired", m.spaceId, m.personId, { space: m.spaceName, spaceId: m.spaceId, name: m.fullName, expiresOn: m.expiresOn }, "client"));
        });
        if (done.ok && done.value) expired++;
      }
      // Approved but never confirmed, and now past its last day: nothing to open any more.
      for (const r of await store.spaceAccess.list({ statuses: ["approved"] })) if (r.expiresOn && r.expiresOn < today) await store.spaceAccess.update(r.id, "approved", { status: "cancelled" }, now);
      const active = await store.people.listActive();
      const keepers = active.filter(ownerOrHr).map((p) => p.id);
      const owners = active.filter((p) => p.roles.includes("owner")).map((p) => p.id);
      const soon = await store.clients.spaceMembersEnding({ from: today, to: addDays(today, WARN_DAYS_BEFORE_END) });
      for (const m of soon) {
        for (const personId of keepers) {
          notes.push({ id: newId(), personId, kind: "space.access_ending", title: `${m.fullName}'s access to ${m.spaceName} ends ${formatDate(m.expiresOn)}`, body: "Ask again for more time, or let it end.", link: "/spaces/access", entityType: "client", entityId: m.spaceId, dedupeKey: `access-ending:${m.spaceId}:${m.personId}:${m.expiresOn}` });
        }
      }
      const reviewBefore = new Date(now.getTime() - REVIEW_EVERY_DAYS * 86_400_000);
      let reviewsDue = 0;
      for (const s of await store.clients.listSpaces({ kind: "all" })) {
        if (s.accessReviewedAt && s.accessReviewedAt >= reviewBefore) continue;
        if (!(await store.clients.listMembers(s.id)).length) continue;
        reviewsDue++;
        const since = s.accessReviewedAt ? s.accessReviewedAt.toISOString().slice(0, 10) : "never";
        for (const personId of owners) {
          notes.push({ id: newId(), personId, kind: "space.review_due", title: `Review who is in ${s.name}`, body: `Every ${REVIEW_EVERY_DAYS} days: keep or remove each member.`, link: "/spaces/access", entityType: "client", entityId: s.id, dedupeKey: `access-review:${s.id}:${since}` });
        }
      }
      await store.notifications.create(notes);
      return { expired, warned: soon.length, reviewsDue, errors: [] };
    },

  };
}
export type SpaceAccessService = ReturnType<typeof createSpaceAccessService>;
