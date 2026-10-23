// Company and team goals (Stage 14.3): the whole company on one screen.
//   - Company goals are set by the owner; team goals sit under one, owned by a space (14.1) or a person, and can link
//     projects whose tasks show as supporting progress.
//   - The number is typed in at check-ins, or read live from data Oppllo One already has (D-14.3a); health is 11.1's
//     pace rule (rules/goals.ts).
//   - Who sees what (D-14.3c): company goals and person-owned team goals, everyone on the team; "leaders only"
//     company goals (and the team goals under them), the owner and strategists; a space's goals, whoever sees that
//     space (private spaces: members and the owner). Money amounts only for people with money.read; others see the
//     percentage and health.
//   - Who changes what: company goals, the owner. Team goals: the owner, strategists, or a space's managers (14.2).
//     Check-ins: the goal's owner, its creator, the owner, or anyone with edit in its space.
// Every change is an event.
import { z } from "zod";
import { isIsoDate, type IsoDate } from "@/lib/dates";
import { isId, newId } from "@/lib/id";
import { forbidden, invalid, notFound, ok, type Result } from "@/lib/result";
import { GOAL_PERIODS, GOAL_SOURCE_UNITS, GOAL_SOURCES, GOAL_UNITS, type GoalPeriod, type GoalSource } from "@/lib/types";
import { optionalId, parse } from "@/lib/validation/common";
import type { DataStore, GoalCheckin, GoalRecord, NewEvent } from "@/repositories";
import { change, commit } from "./change";
import type { Clock } from "./clock";
import { can, clientScope, type Actor } from "./permissions";
import { projectScope } from "./projects";
import { goalHealth, periodLabel, periodOf, supportPercent, type GoalHealth } from "./rules/goals";
import { levelBlocks } from "./spaces";

export type GoalView = Omit<GoalRecord, "target" | "lastValue" | "lastCheckin"> & {
  /** Null when the amount is money this person may not see. */
  target: number | null;
  current: number | null;
  amountsHidden: boolean;
  periodName: string;
  health: GoalHealth;
  supporting: { done: number; total: number; percent: number | null; projects: Array<{ id: string; name: string; done: number; total: number }> } | null;
  lastCheckin: (Omit<GoalCheckin, "value"> & { value: number | null }) | null;
  canEdit: boolean;
  canCheckin: boolean;
};
export type CompanyGoal = GoalView & { teams: GoalView[] };
export const GOAL_FILTERS = ["now", "year", "quarter", "month", "all"] as const;
export type GoalFilter = (typeof GOAL_FILTERS)[number];

const isOwner = (a: Actor) => a.roles.includes("owner");
const isLeader = (a: Actor) => isOwner(a) || a.roles.includes("strategist");

const fields = {
  title: z.string().trim().min(1, { message: "Name the goal." }).max(150),
  description: z.string().trim().max(1000).default(""),
  unit: z.enum(GOAL_UNITS),
  target: z.coerce.number().int({ message: "Whole numbers only." }).min(0).max(1e15),
  period: z.enum(GOAL_PERIODS),
  /** Any day in the period: the financial year, quarter or month around it. */
  on: z.string().refine(isIsoDate, { message: "Pick a date." }),
  source: z.enum(GOAL_SOURCES).default("manual"),
  ownerId: optionalId,
  leadersOnly: z.boolean().default(false),
  projectIds: z.array(z.uuid()).max(20).default([]),
};
const createSchema = z.object({ parentId: optionalId, spaceId: optionalId, ...fields });
const updateSchema = z.object({ goalId: z.uuid(), ...fields });
const checkinSchema = z.object({ goalId: z.uuid(), value: z.coerce.number().int({ message: "Whole numbers only." }).min(0).max(1e15).nullable().default(null), note: z.string().trim().max(500).default("") });

export function createGoalService(deps: { store: DataStore; clock: Clock }) {
  const { store, clock } = deps;

  const event = (actor: Actor, g: Pick<GoalRecord, "id" | "title" | "spaceId">, action: string, data: Record<string, unknown> = {}): NewEvent => ({ actorId: actor.personId, action, entityType: "goal", entityId: g.id, clientId: g.spaceId, data: { title: g.title, ...data } });

  /** What this person can see: a check per goal (its parent's "leaders only" applies to team goals). */
  async function seer(actor: Actor) {
    const all = await store.goals.list();
    const byId = new Map(all.map((g) => [g.id, g]));
    const scope = clientScope(actor);
    const spaces: readonly string[] | "all" = scope.kind === "none" ? [] : scope.kind === "all" && !scope.viewerId ? "all" : await store.clients.visibleIds(scope);
    const sees = (g: GoalRecord): boolean => {
      if (actor.employmentType === "freelancer" && !g.spaceId) return false;
      const parent = g.parentId ? byId.get(g.parentId) : null;
      if ((g.leadersOnly || parent?.leadersOnly) && !isLeader(actor)) return false;
      if (g.spaceId && spaces !== "all" && !spaces.includes(g.spaceId)) return false;
      return true;
    };
    return { all, sees };
  }

  async function mayManageSpace(actor: Actor, spaceId: string | null): Promise<boolean> {
    if (isLeader(actor)) return true;
    return Boolean(spaceId) && !(await levelBlocks(store, actor, spaceId!, "manage")) && (await store.clients.listMembers(spaceId!)).some((m) => m.personId === actor.personId);
  }
  // A space's goal is a team goal even before it's put under a company goal (a space kit makes those, Stage 14.4).
  const isTeam = (g: Pick<GoalRecord, "parentId" | "spaceId">) => Boolean(g.parentId || g.spaceId);
  const canEdit = async (actor: Actor, g: GoalRecord) => (isTeam(g) ? isOwner(actor) || g.createdById === actor.personId || (await mayManageSpace(actor, g.spaceId)) : isOwner(actor));
  async function canCheckin(actor: Actor, g: GoalRecord): Promise<boolean> {
    if (isOwner(actor) || g.ownerId === actor.personId || g.createdById === actor.personId) return true;
    return Boolean(g.spaceId) && (await store.clients.listMembers(g.spaceId!)).some((m) => m.personId === actor.personId) && !(await levelBlocks(store, actor, g.spaceId!, "edit"));
  }

  /** Goals as shown: live numbers (one query per source and period), health, supporting work, hidden amounts. */
  async function views(actor: Actor, goals: GoalRecord[]): Promise<GoalView[]> {
    const today = clock.today();
    const live = new Map<string, Promise<number | null>>();
    const value = (g: GoalRecord) => {
      if (g.source === "manual") return Promise.resolve(g.lastValue);
      const to = g.endsOn < today ? g.endsOn : today;
      const key = `${g.source}:${g.startsOn}:${to}`;
      if (!live.has(key)) live.set(key, today < g.startsOn ? Promise.resolve(null) : store.goals.liveValue(g.source, g.startsOn, to));
      return live.get(key)!;
    };
    const links = await store.goals.projects(goals.map((g) => g.id));
    const pscope = projectScope(actor);
    const seenProject = new Map<string, boolean>();
    const out: GoalView[] = [];
    for (const g of goals) {
      const current = await value(g);
      const hidden = g.unit === "money" && !can(actor, "money.read");
      const mine = [];
      for (const l of links.filter((x) => x.goalId === g.id)) {
        if (!seenProject.has(l.projectId)) seenProject.set(l.projectId, Boolean(await store.projects.findById(l.projectId, pscope, today)));
        if (seenProject.get(l.projectId)) mine.push({ id: l.projectId, name: l.name, done: l.done, total: l.total });
      }
      const done = mine.reduce((n, p) => n + p.done, 0);
      const total = mine.reduce((n, p) => n + p.total, 0);
      const { target, lastValue: _lv, lastCheckin, ...rest } = g;
      out.push({
        ...rest,
        target: hidden ? null : target,
        current: hidden ? null : current,
        amountsHidden: hidden,
        periodName: periodLabel(g.period, g.startsOn),
        health: goalHealth({ target, actual: current, unit: g.unit, source: g.source, startsOn: g.startsOn, endsOn: g.endsOn, today }),
        supporting: mine.length ? { done, total, percent: supportPercent(done, total), projects: mine } : null,
        lastCheckin: lastCheckin ? { ...lastCheckin, value: hidden ? null : lastCheckin.value } : null,
        canEdit: await canEdit(actor, g),
        canCheckin: await canCheckin(actor, g),
      });
    }
    return out;
  }

  /** Which goals a filter keeps: those running today, or of one period length, or all. */
  const keep = (filter: GoalFilter, today: IsoDate) => (g: GoalRecord) => (filter === "all" ? true : filter === "now" ? g.startsOn <= today && today <= g.endsOn : g.period === filter);

  async function checkInput(actor: Actor, v: { unit: string; source: GoalSource; ownerId: string | null; projectIds: string[] }): Promise<string | null> {
    if (v.source !== "manual" && GOAL_SOURCE_UNITS[v.source] !== v.unit) return "That live number is counted in another unit. Pick the matching unit.";
    if (v.ownerId) {
      const p = await store.people.findById(v.ownerId);
      if (!p || p.status !== "active") return "Pick someone on the team.";
    }
    for (const id of v.projectIds) if (!(await store.projects.findById(id, projectScope(actor), clock.today()))) return "One of those projects isn't one you can see.";
    return null;
  }

  const service = {
    /** The founder dashboard: company goals each with their team goals, plus team goals whose company goal is hidden. */
    async dashboard(actor: Actor, filter: GoalFilter = "now"): Promise<{ company: CompanyGoal[]; teams: GoalView[]; canCreate: boolean }> {
      const { all, sees } = await seer(actor);
      const today = clock.today();
      const shown = all.filter(sees).filter(keep(filter, today));
      const v = await views(actor, shown);
      const company = v.filter((g) => !isTeam(g)).map((g) => ({ ...g, teams: v.filter((t) => t.parentId === g.id) }));
      const companyIds = new Set(company.map((g) => g.id));
      return { company, teams: v.filter((g) => isTeam(g) && !(g.parentId && companyIds.has(g.parentId))), canCreate: isLeader(actor) };
    },

    /** A space's own goals (its page). */
    async forSpace(actor: Actor, spaceId: string): Promise<GoalView[]> {
      if (!isId(spaceId)) return [];
      const { all, sees } = await seer(actor);
      return views(actor, all.filter((g) => g.spaceId === spaceId && sees(g)));
    },

    async get(actor: Actor, goalId: string): Promise<Result<GoalView & { checkins: Array<Omit<GoalCheckin, "value"> & { value: number | null }>; parentTitle: string | null }>> {
      const { all, sees } = await seer(actor);
      const g = all.find((x) => x.id === goalId);
      if (!g || !sees(g)) return notFound("That goal");
      const [view] = await views(actor, [g]);
      const parent = g.parentId ? all.find((x) => x.id === g.parentId) : null;
      const checkins = (await store.goals.checkins(g.id)).map((c) => ({ ...c, value: view!.amountsHidden ? null : c.value }));
      return ok({ ...view!, checkins, parentTitle: parent && sees(parent) ? parent.title : null });
    },

    /** Company goals this person may hang a team goal under; spaces they may own one in. */
    async options(actor: Actor): Promise<{ company: Array<{ id: string; title: string }>; spaces: Array<{ id: string; name: string }> }> {
      const { all, sees } = await seer(actor);
      const scope = clientScope(actor);
      const spaces = [];
      for (const id of scope.kind === "none" ? [] : await store.clients.visibleIds(scope)) {
        const c = await store.clients.findById(id, scope);
        if (c?.isInternal && (await mayManageSpace(actor, c.id))) spaces.push({ id: c.id, name: c.name });
      }
      return { company: all.filter((g) => !isTeam(g) && sees(g)).map((g) => ({ id: g.id, title: g.title })), spaces };
    },

    async create(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      const p = parse(createSchema, raw);
      if (!p.ok) return p;
      const v = p.value;
      let leadersOnly = v.leadersOnly;
      if (!v.parentId) {
        if (!isOwner(actor)) return forbidden("The owner sets company goals. Add a team goal under one instead.");
        if (v.spaceId) return invalid("A company goal belongs to the whole company; put space goals under it.");
      } else {
        const { all, sees } = await seer(actor);
        const parent = all.find((g) => g.id === v.parentId);
        if (!parent || isTeam(parent) || !sees(parent)) return notFound("That company goal");
        if (v.spaceId) {
          const space = await store.clients.findById(v.spaceId, clientScope(actor));
          if (!space?.isInternal) return notFound("That space");
          if (!(await mayManageSpace(actor, space.id))) return forbidden("Only the space's managers, strategists or the owner add its goals.");
        } else if (!isLeader(actor)) return forbidden("Strategists and the owner add team goals owned by a person; space managers add their space's.");
        leadersOnly = false;
      }
      const problem = await checkInput(actor, v);
      if (problem) return invalid(problem);
      const { startsOn, endsOn } = periodOf(v.period, v.on);
      const id = newId();
      return commit(store, async (repos) => {
        await repos.goals.create({ id, parentId: v.parentId ?? null, title: v.title, description: v.description, unit: v.unit, target: v.target, period: v.period, startsOn, endsOn, source: v.source, ownerId: v.ownerId ?? null, spaceId: v.spaceId ?? null, leadersOnly, createdById: actor.personId, at: clock.now() });
        if (v.projectIds.length) await repos.goals.setProjects(id, v.projectIds);
        return change({ id }, event(actor, { id, title: v.title, spaceId: v.spaceId ?? null }, "goal.created", { level: v.parentId ? "team" : "company", period: v.period, source: v.source, ...(v.unit === "money" ? {} : { target: v.target }) }));
      });
    },

    async update(actor: Actor, raw: unknown): Promise<Result<null>> {
      const p = parse(updateSchema, raw);
      if (!p.ok) return p;
      const v = p.value;
      const { all, sees } = await seer(actor);
      const g = all.find((x) => x.id === v.goalId);
      if (!g || !sees(g)) return notFound("That goal");
      if (!(await canEdit(actor, g))) return forbidden(isTeam(g) ? "Only the owner, the space's managers or who set it up can change this goal." : "Only the owner changes company goals.");
      const problem = await checkInput(actor, v);
      if (problem) return invalid(problem);
      const { startsOn, endsOn } = periodOf(v.period, v.on);
      return commit(store, async (repos) => {
        await repos.goals.update(g.id, { title: v.title, description: v.description, unit: v.unit, target: v.target, period: v.period, startsOn, endsOn, source: v.source, ownerId: v.ownerId ?? null, leadersOnly: isTeam(g) ? false : v.leadersOnly, at: clock.now() });
        await repos.goals.setProjects(g.id, v.projectIds);
        return change(null, event(actor, g, "goal.changed", { period: v.period, source: v.source }));
      });
    },

    async archive(actor: Actor, goalId: string): Promise<Result<null>> {
      const { all, sees } = await seer(actor);
      const g = all.find((x) => x.id === goalId);
      if (!g || !sees(g)) return notFound("That goal");
      if (!(await canEdit(actor, g))) return forbidden("You can't archive this goal.");
      if (all.some((x) => x.parentId === g.id)) return invalid("Archive its team goals first.");
      return commit(store, async (repos) => {
        await repos.goals.archive(g.id, clock.now());
        return change(null, event(actor, g, "goal.archived"));
      });
    },

    /** A check-in: the number now (needed when the goal is typed in) and a short note. */
    async checkin(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      const p = parse(checkinSchema, raw);
      if (!p.ok) return p;
      const v = p.value;
      const { all, sees } = await seer(actor);
      const g = all.find((x) => x.id === v.goalId);
      if (!g || !sees(g)) return notFound("That goal");
      if (!(await canCheckin(actor, g))) return forbidden("The goal's owner, the space's team or the owner check in on it.");
      if (g.source === "manual" && v.value === null) return invalid("Enter the number now.", { value: ["Enter the number now."] });
      if (g.source !== "manual" && v.value !== null) return invalid("This goal's number is live; add a note only.");
      if (g.unit === "money" && v.value !== null && !can(actor, "money.read")) return forbidden("Money amounts are for people who see fees and invoices.");
      if (!v.note && v.value === null) return invalid("Write a short note.");
      const id = newId();
      return commit(store, async (repos) => {
        await repos.goals.addCheckin({ id, goalId: g.id, value: v.value, note: v.note, personId: actor.personId, at: clock.now() });
        return change({ id }, event(actor, g, "goal.checked_in", { note: v.note.slice(0, 120), ...(g.unit === "money" ? {} : { value: v.value }) }));
      });
    },

    /** For the co-worker (12.5): space goals off track, by rule. Read without a person; posted in the space's chat. */
    async offTrackInSpaces(): Promise<Array<{ id: string; spaceId: string; title: string; reasons: string[] }>> {
      const today = clock.today();
      const out = [];
      for (const g of (await store.goals.list()).filter((x) => x.spaceId && x.startsOn <= today && today <= x.endsOn)) {
        const current = g.source === "manual" ? g.lastValue : await store.goals.liveValue(g.source, g.startsOn, today);
        const h = goalHealth({ target: g.target, actual: current, unit: g.unit, source: g.source, startsOn: g.startsOn, endsOn: g.endsOn, today });
        if (h.level === "off_track") out.push({ id: g.id, spaceId: g.spaceId!, title: g.title, reasons: h.reasons });
      }
      return out;
    },

    periods: GOAL_PERIODS as readonly GoalPeriod[],
  };
  return service;
}

export type GoalService = ReturnType<typeof createGoalService>;
