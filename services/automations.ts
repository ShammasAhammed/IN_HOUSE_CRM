// The daily automations (plan/3 "Automations that run without being asked"; Stage 8.2, D83). Each one only adds
// notifications, each with a dedupe key, so running the job twice in a day never says anything twice.
import { addDays, diffDays } from "@/lib/dates";
import { newId } from "@/lib/id";
import type { DataStore, NotificationWrite } from "@/repositories";
import type { Clock } from "./clock";
import { spaceGuard } from "./spaces";
import { countOf } from "@/lib/format";

/** D30: the owner on day 1, the client's lead strategist after 2 more days. */
export const LEAD_AFTER_DAYS = 3;
export const BURN_WARNINGS = [80, 100] as const;
export const RENEWAL_NOTICE_DAYS = 30;

export function createAutomationService(deps: { store: DataStore; clock: Clock }) {
  const { store, clock } = deps;

  return {
    async runDaily(): Promise<{ overdue: number; burn: number; renewals: number; errors: unknown[] }> {
      const today = clock.today();
      const errors: unknown[] = [];
      // Spaces too (Stage 14.1): a space's lead hears about its late work like a client's; the guard below keeps a
      // private space's notes to its members and the owner.
      const [clients, people] = await Promise.all([Promise.all([store.clients.list({ kind: "all" }), store.clients.listSpaces({ kind: "all" })]).then((x) => x.flat()), store.people.listActive()]);
      const leadOf = new Map(clients.map((c) => [c.id, c.leadStrategist?.id ?? null]));
      const owners = people.filter((p) => p.roles.includes("owner")).map((p) => p.id);
      const bdos = people.filter((p) => p.roles.includes("bdo")).map((p) => p.id);
      const out: Array<NotificationWrite & { clientId?: string }> = [];

      // Overdue tasks.
      const late = await store.tasks.list({ scope: { kind: "all" }, openDueOnOrBefore: addDays(today, -1), statuses: ["todo", "in_progress", "in_review", "blocked"], anyLevel: true, limit: 2000 });
      let overdue = 0;
      for (const t of late) {
        if (!t.dueDate) continue;
        const days = diffDays(t.dueDate, today);
        if (t.ownerId) out.push({ personId: t.ownerId, kind: "task.overdue", title: `Overdue: ${t.title}`, body: `Was due ${days === 1 ? "yesterday" : `${days} days ago`}.`, link: `/tasks/${t.id}`, entityType: "task", entityId: t.id, dedupeKey: `overdue:${t.id}:${t.dueDate}`, clientId: t.clientId });
        const lead = leadOf.get(t.clientId);
        if (days >= LEAD_AFTER_DAYS && lead && lead !== t.ownerId) {
          out.push({ personId: lead, kind: "task.overdue_lead", title: `Still overdue: ${t.title}`, body: `${t.clientName}, due ${countOf(days, "day")} ago${t.ownerName ? `, with ${t.ownerName}` : ", nobody on it"}.`, link: `/tasks/${t.id}`, entityType: "task", entityId: t.id, dedupeKey: `overdue-lead:${t.id}:${t.dueDate}`, clientId: t.clientId });
        }
        overdue++;
      }

      // Retainer burn and renewals.
      let burn = 0;
      let renewals = 0;
      for (const e of await store.engagements.listActiveRetainers()) {
        try {
          const clientName = clients.find((c) => c.id === e.clientId)?.name ?? "A client";
          const period = (await store.engagements.listPeriods(e.id, { withUsage: true })).find((p) => p.periodStart <= today && p.periodEnd >= today);
          const budget = period ? period.baseBudgetMinutes + period.rolloverInMinutes : 0;
          if (period && budget > 0) {
            const pct = Math.floor((period.usedMinutes * 100) / budget);
            const hit = [...BURN_WARNINGS].reverse().find((w) => pct >= w);
            if (hit) {
              for (const personId of new Set([leadOf.get(e.clientId), ...owners].filter((x): x is string => Boolean(x)))) {
                out.push({ personId, kind: "engagement.burn", title: `${clientName}: ${pct}% of this month's hours used`, body: `${e.name}${hit === 100 ? " is over budget." : "."}`, link: `/engagements/${e.id}`, entityType: "engagement", entityId: e.id, dedupeKey: `burn:${e.id}:${period.periodStart}:${hit}`, clientId: e.clientId });
              }
              burn++;
            }
          }
          if (e.renewalDate && e.renewalDate >= today && diffDays(today, e.renewalDate) <= RENEWAL_NOTICE_DAYS) {
            for (const personId of bdos.length ? bdos : owners) {
              out.push({ personId, kind: "engagement.renewal", title: `${clientName} renews on ${e.renewalDate}`, body: `${e.name}: time to talk renewal.`, link: `/engagements/${e.id}`, entityType: "engagement", entityId: e.id, dedupeKey: `renewal:${e.id}:${e.renewalDate}`, clientId: e.clientId });
            }
            renewals++;
          }
        } catch (err) {
          errors.push(err);
        }
      }

      // Nobody is told about a private space they aren't in (Stage 14.1), the same check as every other notification.
      const outside = spaceGuard(store);
      const told: typeof out = [];
      for (const n of out) if (!n.clientId || !(await outside(n.personId, n.clientId))) told.push(n);
      await store.notifications.create(told.map(({ clientId: _client, ...n }) => ({ id: newId(), ...n })));
      return { overdue, burn, renewals, errors };
    },
  };
}
