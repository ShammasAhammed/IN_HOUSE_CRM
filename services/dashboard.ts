// The owner dashboard (plan: "sales (from CRM), late projects, who is on leave, burn risks, capacity"; Stage 8.4).
// One screen of what needs the owner's attention, built from the same repositories as everything else.
import { addDays, diffDays, type IsoDate } from "@/lib/dates";
import { forbidden, ok, type Result } from "@/lib/result";
import type { DataStore, ProjectRow } from "@/repositories";
import type { CapacityService, WeekRow } from "./capacity";
import type { Clock } from "./clock";
import { can, type Actor } from "./permissions";
import { burn as retainerBurn } from "./rules/retainer";

export type BurnRow = { engagementId: string; clientName: string; name: string; usedPercent: number; monthPercent: number };
export type OwnerDashboard = {
  today: IsoDate;
  counts: { activeClients: number; overdueTasks: number; creativesInReview: number; withClients: number };
  lateProjects: ProjectRow[];
  burn: BurnRow[];
  away: Array<{ personName: string; startDate: IsoDate; endDate: IsoDate; halfDay: boolean }>;
  capacity: { over: WeekRow[]; light: WeekRow[] };
  renewals: Array<{ engagementId: string; clientName: string; name: string; renewalDate: IsoDate }>;
};

export function createDashboardService(deps: { store: DataStore; clock: Clock; capacity: CapacityService }) {
  const { store, clock } = deps;
  return {
    async owner(actor: Actor): Promise<Result<OwnerDashboard>> {
      if (!can(actor, "dashboard.read")) return forbidden("The dashboard is for the owner.");
      const today = clock.today();
      const [clients, projects, leave, week, retainers, overdue, assetCounts] = await Promise.all([
        store.clients.list({ kind: "all" }),
        store.projects.list({ scope: { kind: "all" }, statuses: ["active"], today }),
        store.leave.listRequests({ statuses: ["approved"], overlapping: { from: today, to: addDays(today, 6) } }),
        deps.capacity.week(actor),
        store.engagements.listActiveRetainers(),
        store.tasks.list({ scope: { kind: "all" }, openDueOnOrBefore: addDays(today, -1), statuses: ["todo", "in_progress", "in_review", "blocked"], anyLevel: true, limit: 2000 }),
        store.assets.countByState({ scope: { kind: "all" } }),
      ]);
      const clientName = new Map(clients.map((c) => [c.id, c.name]));

      const burn: BurnRow[] = [];
      for (const e of retainers) {
        const p = (await store.engagements.listPeriods(e.id, { withUsage: true })).find((x) => x.periodStart <= today && x.periodEnd >= today);
        if (!p || p.baseBudgetMinutes + p.rolloverInMinutes <= 0) continue;
        // The same calculation as the engagement and client pages, so the numbers always agree (QA S4-B3).
        const b = retainerBurn({ ...p, periodStart: p.coveredFrom, periodEnd: p.coveredTo, today });
        burn.push({ engagementId: e.id, clientName: clientName.get(e.clientId) ?? "—", name: e.name, usedPercent: b.usedPercent, monthPercent: b.elapsedPercent });
      }
      // Ahead of the month is the risk: hours going faster than the days.
      burn.sort((a, b) => b.usedPercent - b.monthPercent - (a.usedPercent - a.monthPercent));

      return ok({
        today,
        counts: {
          activeClients: clients.filter((c) => c.status === "active" && !c.isInternal).length,
          overdueTasks: overdue.length,
          creativesInReview: assetCounts.internal_review ?? 0,
          withClients: assetCounts.client_review ?? 0,
        },
        lateProjects: projects
          .filter((p) => p.overdueTasks > 0 || (p.dueDate !== null && p.dueDate < today))
          .sort((a, b) => b.overdueTasks - a.overdueTasks)
          .slice(0, 8),
        burn: burn.slice(0, 8),
        away: leave.map((l) => ({ personName: l.personName, startDate: l.startDate, endDate: l.cancelledFrom ? addDays(l.cancelledFrom, -1) : l.endDate, halfDay: Boolean(l.halfDay) })),
        capacity: week.ok ? { over: week.value.rows.filter((r) => r.level === "over"), light: week.value.rows.filter((r) => r.level === "light" && r.capacityMinutes > 0) } : { over: [], light: [] },
        renewals: retainers
          .filter((e) => e.renewalDate && e.renewalDate >= today && diffDays(today, e.renewalDate) <= 30)
          .map((e) => ({ engagementId: e.id, clientName: clientName.get(e.clientId) ?? "—", name: e.name, renewalDate: e.renewalDate! })),
      });
    },
  };
}
export type DashboardService = ReturnType<typeof createDashboardService>;
