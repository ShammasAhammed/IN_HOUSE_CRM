// Clients: the list and the basics of one client, shaped by what the person may see.
// Output is built field by field from what the role allows — never by spreading a record and hiding parts —
// and restricted data is never fetched for someone who may not see it.

import { isId } from "@/lib/id";
import { forbidden, notFound, ok, type Result } from "@/lib/result";
import type { ClientSegment, ClientStatus } from "@/lib/types";
import { endOfMonth, startOfMonth } from "@/lib/dates";
import type { EngagementKind, EngagementStatus, RolloverPolicy } from "@/lib/types";
import type {
  AssetSummary,
  ClientContactRecord,
  ClientRecord,
  ClientScope,
  DataStore,
  DeliverableProgress,
  EventRow,
  PersonRef,
  ProjectRow,
  StageRow,
} from "@/repositories";
import type { Clock } from "./clock";
import { oneOffBurn } from "./engagements";
import { projectScope } from "./projects";
import { can, clientScope, type Actor } from "./permissions";
import { burn, type BurnLevel } from "./rules/retainer";

/** Which parts of a client this person may see. Screens show columns from this, never by inspecting data. */
export type ClientVisibility = {
  /** Segment, city, status, lead strategist, team size, services. Interns see only the name (D13). */
  profile: boolean;
  /** Fees (money.read). */
  money: boolean;
  /** Hours budgets and burn (budget.read). */
  burn: boolean;
  /** Contact people, phones, emails (clients.contacts.read, D14). */
  contacts: boolean;
};

export type ClientProfile = {
  segment: ClientSegment;
  city: string | null;
  status: ClientStatus;
  leadStrategist: PersonRef | null;
  teamSize: number;
  /** Names of active services, e.g. "Meta ads for admissions". */
  services: string[];
};

export type RetainerBurn = { engagementId: string; serviceName: string; usedPercent: number; level: BurnLevel };

export type ClientBurn = {
  /** Totals across the client's active retainers this month. All time counts (D26). */
  budgetMinutes: number;
  usedMinutes: number;
  nonBillableMinutes: number;
  usedPercent: number;
  elapsedPercent: number;
  /** The combined total's own level. */
  level: BurnLevel;
  /** What to warn about: the worst of the combined level and each retainer's own level. */
  alertLevel: BurnLevel;
  /** Each retainer on its own, most-burned first. */
  retainers: RetainerBurn[];
};

export type ClientListItem = {
  id: string;
  name: string;
  openTasks: number;
  overdueTasks: number;
  profile?: ClientProfile;
  /** Sum of active retainers' monthly fees. */
  monthlyRetainerPaise?: number;
  burn?: ClientBurn | null;
  primaryContact?: Pick<ClientContactRecord, "name" | "phone" | "email"> | null;
};

export type ClientDetail = ClientListItem & { contacts?: ClientContactRecord[] };

export type EngagementView = {
  id: string;
  name: string;
  serviceName: string;
  kind: EngagementKind;
  status: EngagementStatus;
  startDate: string;
  endDate: string | null;
  renewalDate: string | null;
  rolloverPolicy: RolloverPolicy;
  /** money.read only. */
  feePaise?: number | null;
  /** budget.read only: this month's burn for a retainer, the whole job for a one-off (D27). */
  burn?: (ReturnType<typeof burn> & { nonBillableMinutes: number }) | null;
  deliverables: DeliverableProgress[];
};

export type ClientPage = {
  client: ClientDetail;
  visible: ClientVisibility & {
    assets: boolean;
    history: boolean;
    team: boolean;
    /** The Projects card: for people who see projects (not accounts). */
    projects: boolean;
    /** Projects' open/late counts cover everyone's tasks: not for people who see only their own. */
    projectCounts: boolean;
  };
  /** The client's notes from the edit page (QA S9-08), for the same people who see contacts: they can be commercial. */
  notes: string | null;
  /** What this person can do from the page. */
  actions: { edit: boolean; addEngagement: boolean; openEngagements: boolean; startProject: boolean };
  /** Set when this is one of Oppllo's own spaces (Stage 14.1): no fees, results, ads or contacts there. */
  space: { isPrivate: boolean; isSelf: boolean } | null;
  engagements: EngagementView[];
  projects: Array<ProjectRow & { stages: StageRow[] }>;
  team: Array<{ personId: string; fullName: string; note: string | null }>;
  assets: AssetSummary[];
  history: EventRow[];
};

/** History entries that reveal money, hidden from people without money.read. */
const MONEY_ACTIONS = ["engagement.fee_changed"];
/** History entries that name the client's contact people, hidden without clients.contacts.read (D14). */
const CONTACT_ACTIONS = ["client.contact_added", "client.contact_updated", "client.contact_removed"];
/** What people who don't see the work (the BDO, accounts) see in the history: the client and its engagements. */
const ACCOUNT_ENTITIES = ["client", "client_contact", "engagement", "engagement_period", "deliverable"] as const;
/** Bookkeeping nobody needs in the client's history. */
const QUIET_ACTIONS = ["engagement.period_opened", "engagement.period_updated", "engagement.period_removed", "engagement.period_closed"];

const LEVEL_RANK: Record<BurnLevel, number> = { ok: 0, warning: 1, over: 2 };

export function visibilityFor(actor: Actor, scope: ClientScope): ClientVisibility {
  return {
    profile: scope.kind === "all" || scope.kind === "assigned",
    money: can(actor, "money.read"),
    burn: can(actor, "budget.read"),
    contacts: can(actor, "clients.contacts.read"),
  };
}

export function createClientService(deps: { store: DataStore; clock: Clock }) {
  const { store, clock } = deps;

  async function load(actor: Actor, scope: ClientScope, visible: ClientVisibility, clientIds: string[]) {
    const today = clock.today();
    const needEngagements = visible.profile || visible.money || visible.burn;
    const [engagements, counts, contacts] = await Promise.all([
      needEngagements
        ? store.engagements.listForClients(clientIds, { on: today, includeFees: visible.money, includeBudgets: visible.burn, activeOnly: true })
        : Promise.resolve([]),
      // Interns only ever see their own tasks, so they only count their own.
      store.tasks.countsByClient(clientIds, today, scope.kind === "own_tasks" ? actor.personId : undefined),
      visible.contacts ? store.clients.listContacts(clientIds) : Promise.resolve([]),
    ]);
    const retainers = engagements.filter((e) => e.kind === "retainer");
    const periods = visible.burn ? await store.engagements.periodsOn(retainers.map((e) => e.id), today) : [];
    return { today, engagements, retainers, counts, contacts, periods };
  }

  type Loaded = Awaited<ReturnType<typeof load>>;

  function burnFor(clientId: string, l: Loaded): ClientBurn | null {
    const mine = l.retainers.filter((e) => e.clientId === clientId);
    const periods = l.periods.filter((p) => mine.some((e) => e.id === p.engagementId));
    if (periods.length === 0) return null;

    // Elapsed time runs over the days actually covered, so a mid-month start isn't shown as half-gone.
    const coveredFrom = periods.map((p) => p.coveredFrom).sort()[0]!;
    const coveredTo = periods.map((p) => p.coveredTo).sort().at(-1)!;
    const sum = (key: "baseBudgetMinutes" | "rolloverInMinutes" | "usedMinutes" | "nonBillableMinutes") =>
      periods.reduce((total, p) => total + p[key], 0);
    const combined = burn({
      baseBudgetMinutes: sum("baseBudgetMinutes"),
      rolloverInMinutes: sum("rolloverInMinutes"),
      usedMinutes: sum("usedMinutes"),
      periodStart: coveredFrom,
      periodEnd: coveredTo,
      today: l.today,
    });
    const retainers = periods
      .map((p): RetainerBurn => {
        const one = burn({ ...p, periodStart: p.coveredFrom, periodEnd: p.coveredTo, today: l.today });
        const engagement = mine.find((e) => e.id === p.engagementId)!;
        return { engagementId: p.engagementId, serviceName: engagement.serviceName, usedPercent: one.usedPercent, level: one.level };
      })
      .sort((a, b) => b.usedPercent - a.usedPercent);
    const alertLevel = retainers.reduce<BurnLevel>((lvl, r) => (LEVEL_RANK[r.level] > LEVEL_RANK[lvl] ? r.level : lvl), combined.level);

    return {
      budgetMinutes: combined.budgetMinutes,
      usedMinutes: combined.usedMinutes,
      nonBillableMinutes: sum("nonBillableMinutes"),
      usedPercent: combined.usedPercent,
      elapsedPercent: combined.elapsedPercent,
      level: combined.level,
      alertLevel,
      retainers,
    };
  }

  function shape(client: ClientRecord, visible: ClientVisibility, l: Loaded, withContacts: boolean): ClientDetail {
    const count = l.counts.find((c) => c.clientId === client.id);
    const item: ClientDetail = {
      id: client.id,
      name: client.name,
      openTasks: count?.open ?? 0,
      overdueTasks: count?.overdue ?? 0,
    };
    if (visible.profile) {
      item.profile = {
        segment: client.segment,
        city: client.city,
        status: client.status,
        leadStrategist: client.leadStrategist,
        teamSize: client.teamSize,
        services: [...new Set(l.engagements.filter((e) => e.clientId === client.id).map((e) => e.serviceName))],
      };
    }
    if (visible.money) {
      item.monthlyRetainerPaise = l.retainers.filter((e) => e.clientId === client.id).reduce((s, e) => s + (e.currentFeePaise ?? 0), 0);
    }
    if (visible.burn) item.burn = burnFor(client.id, l);
    if (visible.contacts) {
      const contacts = l.contacts.filter((c) => c.clientId === client.id);
      const primary = contacts.find((c) => c.isPrimary) ?? contacts[0];
      item.primaryContact = primary ? { name: primary.name, phone: primary.phone, email: primary.email } : null;
      if (withContacts) item.contacts = contacts;
    }
    return item;
  }

  return {
    async list(actor: Actor): Promise<Result<{ clients: ClientListItem[]; visible: ClientVisibility }>> {
      const scope = clientScope(actor);
      if (scope.kind === "none") return forbidden("Client work isn't part of your role.");
      const visible = visibilityFor(actor, scope);

      const clients = await store.clients.list(scope);
      if (clients.length === 0) return ok({ clients: [], visible });
      const loaded = await load(actor, scope, visible, clients.map((c) => c.id));
      return ok({ clients: clients.map((c) => shape(c, visible, loaded, false)), visible });
    },

    /** Stage 14.5: the spaces this person can see (for the assistant's and the MCP's name lookups). */
    async spaceOptions(actor: Actor): Promise<Array<{ id: string; name: string }>> {
      const scope = clientScope(actor);
      if (scope.kind === "none") return [];
      return (await store.clients.listSpaces(scope)).filter((c) => c.status !== "churned").map((c) => ({ id: c.id, name: c.name }));
    },

    /** Names for pickers and filters: every client you can see that isn't churned, with or without tasks (test report L13). */
    async options(actor: Actor): Promise<Array<{ id: string; name: string }>> {
      const scope = clientScope(actor);
      if (scope.kind === "none") return [];
      return (await store.clients.list(scope)).filter((c) => c.status !== "churned").map((c) => ({ id: c.id, name: c.name }));
    },

    /** Everything about one client on one screen (plan: "the screen that makes the system worth opening"). */
    async page(actor: Actor, clientId: string): Promise<Result<ClientPage>> {
      const scope = clientScope(actor);
      if (scope.kind === "none") return forbidden("Client work isn't part of your role.");
      if (!isId(clientId)) return notFound("That client");
      const client = await store.clients.findById(clientId, scope);
      if (!client) return notFound("That client");
      const base = visibilityFor(actor, scope);
      const pScope = projectScope(actor);
      const visible = {
        ...base,
        assets: can(actor, "assets.read"),
        history: base.profile,
        team: base.profile,
        projects: can(actor, "projects.read.all") || can(actor, "projects.read.assigned") || scope.kind === "own_tasks",
        projectCounts: pScope.kind !== "own",
      };
      const today = clock.today();
      // Independent reads run together: the client page should stay fast.
      const [loaded, engagements] = await Promise.all([
        load(actor, scope, base, [client.id]),
        base.profile
          ? store.engagements.listForClients([client.id], { on: today, includeFees: base.money, includeBudgets: base.burn, activeOnly: false })
          : Promise.resolve([]),
      ]);
      // History: no money without money.read, no contact names without contact access (D14), and only the client and
      // its engagements for people who don't see the work (the BDO, accounts).
      const seesWork = can(actor, "tasks.read.all") || can(actor, "tasks.read.assigned");
      const historyOpts = {
        limit: 12,
        excludeActions: [...QUIET_ACTIONS, ...(base.money ? [] : MONEY_ACTIONS), ...(base.contacts ? [] : CONTACT_ACTIONS)],
        ...(seesWork ? {} : { entityTypes: [...ACCOUNT_ENTITIES, ...(can(actor, "projects.read.all") ? (["project"] as const) : [])] }),
      };
      const live = engagements.filter((e) => e.status === "active" || e.status === "paused");
      const oneOffs = live.filter((e) => e.kind === "one_off");
      const [projects, team, assets, history, periods, progress, usage] = await Promise.all([
        visible.projects ? store.projects.list({ clientIds: [client.id], scope: pScope, today }) : Promise.resolve([]),
        visible.team ? store.clients.listMembers(client.id) : Promise.resolve([]),
        visible.assets ? store.assets.listForClient(client.id, 8) : Promise.resolve([]),
        visible.history ? store.events.listForClient(client.id, historyOpts) : Promise.resolve([]),
        base.burn ? store.engagements.periodsOn(live.filter((e) => e.kind === "retainer").map((e) => e.id), today) : Promise.resolve([]),
        // Retainers promise counts per month; a one-off job's count is for the whole job.
        base.profile
          ? Promise.all([
              store.engagements.deliverablesProgress(live.filter((e) => e.kind === "retainer").map((e) => e.id), startOfMonth(today), endOfMonth(today)),
              store.engagements.deliverablesProgress(oneOffs.map((e) => e.id), "2000-01-01", "2999-12-31"),
            ]).then((parts) => parts.flat())
          : Promise.resolve([]),
        base.burn ? store.engagements.totalUsage(oneOffs.map((e) => e.id)) : Promise.resolve([]),
      ]);
      const [stages, details] = await Promise.all([store.projects.listStages(projects.map((p) => p.id)), can(actor, "clients.contacts.read") ? store.clients.findDetails(client.id) : null]);

      return ok({
        client: shape(client, base, loaded, true),
        visible,
        notes: details?.notes ?? null,
        space: client.isInternal ? { isPrivate: client.isPrivate, isSelf: client.isSelf } : null,
        actions: {
          edit: can(actor, "clients.write") && !client.isInternal,
          addEngagement: can(actor, "engagements.write") && !client.isInternal,
          openEngagements: can(actor, "engagements.read"),
          startProject: can(actor, "projects.write"),
        },
        engagements: live.map((e) => {
          const view: EngagementView = {
            id: e.id,
            name: e.name,
            serviceName: e.serviceName,
            kind: e.kind,
            status: e.status,
            startDate: e.startDate,
            endDate: e.endDate,
            renewalDate: e.renewalDate,
            rolloverPolicy: e.rolloverPolicy,
            deliverables: progress.filter((d) => d.engagementId === e.id),
          };
          if (base.money) view.feePaise = e.currentFeePaise;
          if (base.burn && e.kind === "one_off") {
            view.burn = oneOffBurn({ hoursBudgetMinutes: e.hoursBudgetMinutes ?? 0, startDate: e.startDate, endDate: e.endDate }, usage.find((u) => u.engagementId === e.id), today);
          } else if (base.burn) {
            const p = periods.find((x) => x.engagementId === e.id);
            view.burn = p
              ? { ...burn({ ...p, periodStart: p.coveredFrom, periodEnd: p.coveredTo, today }), nonBillableMinutes: p.nonBillableMinutes }
              : null;
          }
          return view;
        }),
        projects: projects
          .map((p) => ({ ...p, stages: stages.filter((st) => st.projectId === p.id) }))
          .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || (b.startDate ?? "").localeCompare(a.startDate ?? "")),
        team,
        assets,
        history,
      });
    },

    async get(actor: Actor, clientId: string): Promise<Result<{ client: ClientDetail; visible: ClientVisibility }>> {
      const scope = clientScope(actor);
      if (scope.kind === "none") return forbidden("Client work isn't part of your role.");
      if (!isId(clientId)) return notFound("That client");
      const visible = visibilityFor(actor, scope);

      // Out-of-scope clients look exactly like missing ones, so their existence is not revealed.
      const client = await store.clients.findById(clientId, scope);
      if (!client) return notFound("That client");
      return ok({ client: shape(client, visible, await load(actor, scope, visible, [client.id]), true), visible });
    },
  };
}

export type ClientService = ReturnType<typeof createClientService>;

const STATUS_ORDER = ["active", "planned", "on_hold", "completed", "cancelled"];
