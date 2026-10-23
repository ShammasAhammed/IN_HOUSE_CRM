// Won leads from the prospect CRM become a "won, set up?" list for the BDO and the owner (Stage 8.3, D84). Setting one
// up opens the new-client form filled from the lead; once a client carries the lead's id it leaves the list.
import { isId } from "@/lib/id";
import { fail, forbidden, notFound, ok, type Result } from "@/lib/result";
import { change, commit } from "./change";
import type { ClientSegment } from "@/lib/types";
import type { CrmSource, DataStore, WonLeadRecord } from "@/repositories";
import type { Clock } from "./clock";
import { can, type Actor } from "./permissions";

const DENIED = "Won leads are for the BDO and the owner.";

/** The CRM's segment is free text; this picks the closest of ours. */
export function segmentFrom(text: string | null): ClientSegment {
  const t = (text ?? "").toLowerCase();
  if (/coach|neet|jee|ias|psc|entrance|tuition/.test(t)) return "coaching";
  if (/school|cbse|icse/.test(t)) return "school";
  if (/college|university|nursing|engineering|arts|science|b\.?ed/.test(t)) return "college";
  if (/ed-?tech|online|app/.test(t)) return "edtech";
  if (/training|institute|academy|skill/.test(t)) return "training_institute";
  return "other";
}

/** What a copy did. `inCrm` and `here` should match after a full copy. */
export type LeadCopyReport = { inserted: number; updated: number; activities: number; unmatchedOwners: string[]; inCrm: number; here: number; errors: unknown[] };

export function createCrmService(deps: { store: DataStore; source: CrmSource; clock: Clock }) {
  const { store, source, clock } = deps;
  const allowed = (actor: Actor) => can(actor, "clients.write") && can(actor, "engagements.write");
  return {
    connected: source.connected,

    /** Daily job and the "Check now" button: copy newly won leads into the list. */
    async sync(): Promise<{ won: number; errors: unknown[] }> {
      if (!source.connected) return { won: 0, errors: [] };
      try {
        return { won: await store.crmInbox.upsert(await source.listWon(500)), errors: [] };
      } catch (err) {
        return { won: 0, errors: [err] };
      }
    },

    async inbox(actor: Actor, includeDone = false): Promise<Result<{ connected: boolean; leads: WonLeadRecord[] }>> {
      if (!allowed(actor)) return forbidden(DENIED);
      return ok({ connected: source.connected, leads: await store.crmInbox.list({ includeDone }) });
    },

    /** The new-client form's starting values for a won lead. */
    async prefill(actor: Actor, rowId: string): Promise<Result<{ name: string; segment: ClientSegment; crmLeadId: string; notes: string }>> {
      if (!allowed(actor)) return forbidden(DENIED);
      const lead = isId(rowId) ? await store.crmInbox.find(rowId) : null;
      if (!lead) return notFound("That lead");
      const notes = [lead.phone ? `Phone: ${lead.phone}` : null, lead.ownerName ? `Won by ${lead.ownerName} in the CRM.` : null].filter(Boolean).join("\n");
      return ok({ name: lead.institution ?? lead.name, segment: segmentFrom(`${lead.segment ?? ""} ${lead.institution ?? ""}`), crmLeadId: lead.id, notes });
    },

    /** Not a client after all (a duplicate, or the deal fell through). */
    async dismiss(actor: Actor, rowId: string): Promise<Result<null>> {
      if (!allowed(actor)) return forbidden(DENIED);
      if (!isId(rowId) || !(await store.crmInbox.find(rowId))) return notFound("That lead");
      await store.crmInbox.dismiss(rowId, actor.personId, clock.now());
      return ok(null);
    },

    /**
     * Stage 10a (D88): copy every lead and its timeline from the old CRM, one way. Re-running updates what changed
     * there and never duplicates. CRM users become Oppllo people by email; the CRM itself is only read.
     */
    async copyLeads(): Promise<LeadCopyReport> {
      const none: LeadCopyReport = { inserted: 0, updated: 0, activities: 0, unmatchedOwners: [], inCrm: 0, here: 0, errors: [] };
      // After switch day leads are worked in Oppllo One: copying the CRM again would undo that work (D91).
      if (!source.connected) return none;
      // After switch day leads are worked here: the copy only adds leads the CRM still receives, never changes ours (D91).
      try {
        const [crmUsers, leads, activities, sources] = await Promise.all([source.users(), source.allLeads(), source.allActivities(), source.sources()]);
        await store.leads.upsertSources(sources);
        // The CRM's "send results to ads" choices, once: after that they're edited here.
        if (!(await store.calendar.getSetting("ad_conversions"))) {
          const conv = await source.conversionSettings();
          if (conv) await store.calendar.setSetting("ad_conversions", conv, null);
        }
        const personOf = new Map<string, string>();
        const unmatched = new Set<string>();
        for (const u of crmUsers) {
          const person = u.email ? await store.people.findByEmail(u.email) : null;
          if (person) personOf.set(u.uid, person.id);
          else unmatched.add(u.name ?? u.email ?? u.uid);
        }
        const at = clock.now();
        const live = Boolean(await store.calendar.getSetting("sales_live"));
        const result = await store.leads.upsertCopies(
          leads.map(({ ownerCrmUid, ...l }) => ({ ...l, ownerId: ownerCrmUid ? (personOf.get(ownerCrmUid) ?? null) : null })),
          at,
          { insertOnly: live },
        );
        // Leads deleted in the CRM go here too (soft delete, with an event), until switch day.
        if (!live && leads.length) {
          const removed = await store.leads.removeMissingCopies(leads.map((l) => l.crmId), at);
          for (const id of removed) await commit(store, async () => change(null, { actorId: null, action: "lead.removed_in_crm", entityType: "lead", entityId: id }));
        }
        const added = await store.leads.insertActivityCopies(activities.map(({ byCrmUid, ...a }) => ({ ...a, byId: byCrmUid ? (personOf.get(byCrmUid) ?? null) : null })));
        const here = await store.leads.counts();
        return { ...result, activities: added, unmatchedOwners: [...unmatched], inCrm: leads.length, here: here.copied, errors: [] };
      } catch (error) {
        return { ...none, errors: [error] };
      }
    },

    /** The owner's "Copy from the CRM now" button on the Sales screens. */
    async copyNow(actor: Actor): Promise<Result<LeadCopyReport>> {
      if (!can(actor, "settings.manage")) return forbidden("Only the owner runs the copy from the CRM.");
      if (!source.connected) return fail("conflict", "The CRM isn't connected yet. The owner connects it.");
      const report = await this.copyLeads();
      return report.errors.length ? fail("conflict", "Couldn't read the CRM just now. Try again in a minute.") : ok(report);
    },
  };
}
